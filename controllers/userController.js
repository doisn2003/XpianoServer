const UserModel = require('../models/userModel');
const { supabaseAdmin } = require('../utils/supabaseClient');

class UserController {
    // GET /api/users - Get all users (Admin only)
    static async getAllUsers(req, res) {
        try {
            const { role, is_verified } = req.query;

            const filters = {};
            if (role) filters.role = role;
            if (is_verified !== undefined) filters.is_verified = is_verified === 'true';

            const users = await UserModel.findAll(filters);

            res.status(200).json({
                success: true,
                count: users.length,
                data: users
            });
        } catch (error) {
            console.error('Error in getAllUsers:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách người dùng',
                error: error.message
            });
        }
    }

    // GET /api/users/:id - Get user by ID (Admin only)
    static async getUserById(req, res) {
        try {
            const { id } = req.params;
            const user = await UserModel.findById(id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            res.status(200).json({
                success: true,
                data: user
            });
        } catch (error) {
            console.error('Error in getUserById:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin người dùng',
                error: error.message
            });
        }
    }

    // PUT /api/users/:id - Update user (Admin only)
    static async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { full_name, phone, role, is_verified, avatar_url } = req.body;

            // Validate role if provided
            if (role && !['user', 'admin', 'teacher'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Role không hợp lệ'
                });
            }

            const updatedUser = await UserModel.update(id, {
                full_name,
                phone,
                role,
                is_verified,
                avatar_url
            });

            if (!updatedUser) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Cập nhật người dùng thành công',
                data: updatedUser
            });
        } catch (error) {
            console.error('Error in updateUser:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật người dùng',
                error: error.message
            });
        }
    }

    // DELETE /api/users/:id - Delete user (Admin only)
    static async deleteUser(req, res) {
        try {
            const { id } = req.params;

            // Prevent admin from deleting themselves
            if (parseInt(id) === req.user.id) {
                return res.status(400).json({
                    success: false,
                    message: 'Bạn không thể xóa chính mình'
                });
            }

            const deletedUser = await UserModel.delete(id);

            if (!deletedUser) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Xóa người dùng thành công',
                data: deletedUser
            });
        } catch (error) {
            console.error('Error in deleteUser:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa người dùng',
                error: error.message
            });
        }
    }

    // GET /api/users/stats - Get user statistics (Admin only)
    static async getStats(req, res) {
        try {
            const stats = await UserModel.getStats();

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error in getStats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê',
                error: error.message
            });
        }
    }

    // POST /api/users - Create user (Admin only)
    static async createUser(req, res) {
        // This requires Supabase Service Role Key to create users via API
        // For now, return 501 Not Implemented or asking to use Supabase Dashboard
        return res.status(501).json({
            success: false,
            message: 'Tính năng tạo người dùng qua API chưa được hỗ trợ. Vui lòng sử dụng Supabase Dashboard hoặc trang Đăng ký.'
        });
    }

    // ==============================================
    // TEACHER PROFILE MANAGEMENT (Admin)
    // ==============================================

    // GET /api/users/teacher-profiles - Get all teacher profiles with filtering
    static async getAllTeacherProfiles(req, res) {
        try {
            const { verification_status } = req.query;

            let query = supabaseAdmin
                .from('teacher_profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (verification_status) {
                query = query.eq('verification_status', verification_status);
            }

            const { data, error } = await query;

            if (error) throw error;

            console.log(`📋 Admin fetched ${data?.length || 0} teacher profiles` + 
                        (verification_status ? ` with status: ${verification_status}` : ''));

            res.status(200).json({
                success: true,
                count: data?.length || 0,
                data: data || []
            });
        } catch (error) {
            console.error('❌ Error in getAllTeacherProfiles:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách hồ sơ giáo viên',
                error: error.message
            });
        }
    }

    // PUT /api/users/teacher-profiles/:id/approve - Approve teacher profile
    static async approveTeacher(req, res) {
        try {
            const { id } = req.params;
            const adminId = req.user.id;

            // Get teacher profile first
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('teacher_profiles')
                .select('user_id, verification_status')
                .eq('id', id)
                .single();

            if (fetchError || !profile) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hồ sơ giáo viên'
                });
            }

            if (profile.verification_status === 'approved') {
                return res.status(400).json({
                    success: false,
                    message: 'Hồ sơ đã được phê duyệt trước đó'
                });
            }

            // Update teacher profile status
            const { data, error } = await supabaseAdmin
                .from('teacher_profiles')
                .update({
                    verification_status: 'approved',
                    approved_at: new Date().toISOString(),
                    rejected_reason: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            console.log(`✅ Admin ${adminId} approved teacher profile ${id} for user ${profile.user_id}`);

            res.status(200).json({
                success: true,
                message: 'Phê duyệt hồ sơ giáo viên thành công',
                data
            });
        } catch (error) {
            console.error('Error in approveTeacher:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi phê duyệt hồ sơ',
                error: error.message
            });
        }
    }

    // PUT /api/users/teacher-profiles/:id/reject - Reject teacher profile
    static async rejectTeacher(req, res) {
        try {
            const { id } = req.params;
            const { rejected_reason } = req.body;
            const adminId = req.user.id;

            if (!rejected_reason || rejected_reason.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp lý do từ chối'
                });
            }

            // Get teacher profile first
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('teacher_profiles')
                .select('user_id, verification_status')
                .eq('id', id)
                .single();

            if (fetchError || !profile) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hồ sơ giáo viên'
                });
            }

            // Update teacher profile status
            const { data, error } = await supabaseAdmin
                .from('teacher_profiles')
                .update({
                    verification_status: 'rejected',
                    rejected_reason: rejected_reason.trim(),
                    approved_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            console.log(`❌ Admin ${adminId} rejected teacher profile ${id} for user ${profile.user_id}: ${rejected_reason}`);

            res.status(200).json({
                success: true,
                message: 'Từ chối hồ sơ giáo viên thành công',
                data
            });
        } catch (error) {
            console.error('Error in rejectTeacher:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi từ chối hồ sơ',
                error: error.message
            });
        }
    }

    // PUT /api/users/teacher-profiles/:id/revoke - Revoke teacher approval (cancel contract)
    static async revokeTeacherApproval(req, res) {
        try {
            const { id } = req.params;
            const { revoke_reason } = req.body;
            const adminId = req.user.id;

            if (!revoke_reason || revoke_reason.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp lý do hủy hợp đồng'
                });
            }

            // Get teacher profile first
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('teacher_profiles')
                .select('user_id, full_name, verification_status')
                .eq('id', id)
                .single();

            if (fetchError || !profile) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hồ sơ giáo viên'
                });
            }

            if (profile.verification_status !== 'approved') {
                return res.status(400).json({
                    success: false,
                    message: 'Chỉ có thể hủy hợp đồng với giáo viên đang hoạt động'
                });
            }

            // Update teacher profile status back to rejected
            // Teacher keeps their account and can resubmit profile
            const { data, error } = await supabaseAdmin
                .from('teacher_profiles')
                .update({
                    verification_status: 'rejected',
                    rejected_reason: `[HỦY HỢP ĐỒNG] ${revoke_reason.trim()}`,
                    approved_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            console.log(`🔴 Admin ${adminId} revoked approval for teacher ${id} (${profile.full_name}): ${revoke_reason}`);

            res.status(200).json({
                success: true,
                message: 'Đã hủy hợp đồng. Giáo viên có thể nộp lại hồ sơ sau khi chỉnh sửa.',
                data
            });
        } catch (error) {
            console.error('Error in revokeTeacherApproval:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi hủy hợp đồng',
                error: error.message
            });
        }
    }
}

module.exports = UserController;
