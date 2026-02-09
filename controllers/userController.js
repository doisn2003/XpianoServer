const UserModel = require('../models/userModel');

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
}

module.exports = UserController;
