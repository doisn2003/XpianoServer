const { supabaseAdmin } = require('../utils/supabaseClient');
const pool = require('../config/database');

class TeacherController {
    // GET /api/teacher/profile - Get current teacher's profile
    static async getMyProfile(req, res) {
        try {
            const userId = req.user.id;

            const { data, error } = await supabaseAdmin
                .from('teacher_profiles')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                throw error;
            }

            res.status(200).json({
                success: true,
                data: data || null
            });
        } catch (error) {
            console.error('Error in getMyProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin hồ sơ giáo viên',
                error: error.message
            });
        }
    }

    // POST /api/teacher/profile - Submit teacher profile for review
    static async submitProfile(req, res) {
        try {
            const userId = req.user.id;
            const {
                full_name,
                specializations,
                years_experience,
                bio,
                teach_online,
                teach_offline,
                locations,
                price_online,
                price_offline,
                bundle_8_sessions,
                bundle_8_discount,
                bundle_12_sessions,
                bundle_12_discount,
                allow_trial_lesson,
                id_number,
                id_front_url,
                id_back_url,
                bank_name,
                bank_account,
                account_holder,
                certificates_description,
                certificate_urls,
                avatar_url,
                video_demo_url
            } = req.body;

            // Validate required fields
            if (!full_name || !specializations || !years_experience || !bio) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin bắt buộc'
                });
            }

            // Check if profile already exists
            const { data: existing } = await supabaseAdmin
                .from('teacher_profiles')
                .select('id, verification_status')
                .eq('user_id', userId)
                .single();

            let result;

            if (existing) {
                // Update existing profile
                const { data, error } = await supabaseAdmin
                    .from('teacher_profiles')
                    .update({
                        full_name,
                        specializations,
                        years_experience,
                        bio,
                        teach_online: teach_online || false,
                        teach_offline: teach_offline || false,
                        locations: locations || [],
                        price_online: price_online || 0,
                        price_offline: price_offline || 0,
                        bundle_8_sessions: bundle_8_sessions || 8,
                        bundle_8_discount: bundle_8_discount || '0',
                        bundle_12_sessions: bundle_12_sessions || 12,
                        bundle_12_discount: bundle_12_discount || '0',
                        allow_trial_lesson: allow_trial_lesson || false,
                        id_number,
                        id_front_url,
                        id_back_url,
                        bank_name,
                        bank_account,
                        account_holder,
                        certificates_description,
                        certificate_urls: certificate_urls || [],
                        avatar_url,
                        video_demo_url,
                        verification_status: 'pending',
                        rejected_reason: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userId)
                    .select()
                    .single();

                if (error) throw error;
                result = data;
            } else {
                // Create new profile
                const { data, error } = await supabaseAdmin
                    .from('teacher_profiles')
                    .insert({
                        user_id: userId,
                        full_name,
                        specializations,
                        years_experience,
                        bio,
                        teach_online: teach_online || false,
                        teach_offline: teach_offline || false,
                        locations: locations || [],
                        price_online: price_online || 0,
                        price_offline: price_offline || 0,
                        bundle_8_sessions: bundle_8_sessions || 8,
                        bundle_8_discount: bundle_8_discount || '0',
                        bundle_12_sessions: bundle_12_sessions || 12,
                        bundle_12_discount: bundle_12_discount || '0',
                        allow_trial_lesson: allow_trial_lesson || false,
                        id_number,
                        id_front_url,
                        id_back_url,
                        bank_name,
                        bank_account,
                        account_holder,
                        certificates_description,
                        certificate_urls: certificate_urls || [],
                        avatar_url,
                        video_demo_url,
                        verification_status: 'pending'
                    })
                    .select()
                    .single();

                if (error) throw error;
                result = data;
            }

            res.status(200).json({
                success: true,
                message: 'Gửi hồ sơ thành công! Vui lòng đợi admin phê duyệt.',
                data: result
            });
        } catch (error) {
            console.error('Error in submitProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi gửi hồ sơ giáo viên',
                error: error.message
            });
        }
    }

    // GET /api/teacher/courses - Get teacher's courses
    static async getMyCourses(req, res) {
        try {
            const userId = req.user.id;

            // Check if teacher is approved
            const { data: profile } = await supabaseAdmin
                .from('teacher_profiles')
                .select('verification_status')
                .eq('user_id', userId)
                .single();

            if (!profile || profile.verification_status !== 'approved') {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn cần được phê duyệt trước khi quản lý khóa học'
                });
            }

            // Get courses (placeholder - you'll need to create courses table)
            const { data, error } = await supabaseAdmin
                .from('courses')
                .select('*, enrollments:course_enrollments(count)')
                .eq('teacher_id', userId)
                .order('created_at', { ascending: false });

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            res.status(200).json({
                success: true,
                data: data || []
            });
        } catch (error) {
            console.error('Error in getMyCourses:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách khóa học',
                error: error.message
            });
        }
    }

    // POST /api/teacher/courses - Create a new course
    static async createCourse(req, res) {
        try {
            const userId = req.user.id;
            const {
                title,
                description,
                price,
                duration_weeks,
                sessions_per_week,
                max_students,
                start_date,
                is_online,
                location
            } = req.body;

            // Validate
            if (!title || !description || !price || !duration_weeks) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin khóa học'
                });
            }

            // Check if teacher is approved
            const { data: profile } = await supabaseAdmin
                .from('teacher_profiles')
                .select('verification_status')
                .eq('user_id', userId)
                .single();

            if (!profile || profile.verification_status !== 'approved') {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn cần được phê duyệt trước khi tạo khóa học'
                });
            }

            // Create course
            const { data, error } = await supabaseAdmin
                .from('courses')
                .insert({
                    teacher_id: userId,
                    title,
                    description,
                    price,
                    duration_weeks,
                    sessions_per_week: sessions_per_week || 2,
                    max_students: max_students || 10,
                    start_date,
                    is_online: is_online !== false,
                    location,
                    status: 'active'
                })
                .select()
                .single();

            if (error) throw error;

            res.status(201).json({
                success: true,
                message: 'Tạo khóa học thành công!',
                data
            });
        } catch (error) {
            console.error('Error in createCourse:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo khóa học',
                error: error.message
            });
        }
    }

    // GET /api/teacher/stats - Get teacher statistics
    static async getStats(req, res) {
        try {
            const userId = req.user.id;

            // Get total courses
            const { count: totalCourses } = await supabaseAdmin
                .from('courses')
                .select('*', { count: 'exact', head: true })
                .eq('teacher_id', userId);

            // Get total students
            const { count: totalStudents } = await supabaseAdmin
                .from('course_enrollments')
                .select('courses!inner(teacher_id)', { count: 'exact', head: true })
                .eq('courses.teacher_id', userId);

            // Get total revenue (placeholder)
            const { data: enrollments } = await supabaseAdmin
                .from('course_enrollments')
                .select('amount_paid, courses!inner(teacher_id)')
                .eq('courses.teacher_id', userId)
                .eq('payment_status', 'paid');

            const totalRevenue = enrollments?.reduce((sum, e) => sum + (e.amount_paid || 0), 0) || 0;

            res.status(200).json({
                success: true,
                data: {
                    totalCourses: totalCourses || 0,
                    totalStudents: totalStudents || 0,
                    totalRevenue
                }
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
}

module.exports = TeacherController;
