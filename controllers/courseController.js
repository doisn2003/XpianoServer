/**
 * courseController.js
 * Quản lý Course Template — Khóa học (nội dung, giáo trình, bài tập).
 * Course KHÔNG còn chứa lịch học hay sĩ số.
 * Lịch tuyển sinh → scheduleController.js
 * Lớp học thực tế → classController.js
 */
const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const CourseController = {};

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────

async function fetchProfiles(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', userIds);
    const map = {};
    (profiles || []).forEach(p => { map[p.id] = p; });
    return map;
}

function validateTeacherRole(req, res) {
    if (!req.user || !['teacher', 'admin'].includes(req.user.role)) {
        res.status(403).json({ success: false, message: 'Chỉ giáo viên mới có thể thực hiện thao tác này' });
        return false;
    }
    return true;
}

// ─────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────

/** GET /api/courses — Danh sách khóa học public (status = active) */
CourseController.getPublicCourses = async (req, res) => {
    try {
        const { cursor, limit } = parsePagination(req.query);
        const { level, category, search } = req.query;

        let query = supabaseAdmin
            .from('courses')
            .select('id, teacher_id, title, description, price, level, category, thumbnail_url, cover_url, demo_video_url, objectives, status, created_at')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) query = query.lt('created_at', cursor);
        if (level) query = query.eq('level', level);
        if (category) query = query.eq('category', category);
        if (search) query = query.ilike('title', `%${search}%`);

        const { data: courses, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(courses, limit);
        const teacherIds = [...new Set(response.data.map(c => c.teacher_id))];
        const profileMap = await fetchProfiles(teacherIds);

        response.data = response.data.map(c => ({
            ...c,
            teacher: profileMap[c.teacher_id] || { id: c.teacher_id }
        }));

        res.json({ success: true, ...response });
    } catch (e) {
        console.error('getPublicCourses error', e);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách khóa học', error: e.message });
    }
};

/** GET /api/courses/:id — Chi tiết khóa học (kèm schedules đang mở tuyển sinh) */
CourseController.getCourseDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: course, error } = await supabaseAdmin
            .from('courses')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !course) return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });

        // Enrich teacher profile
        const profileMap = await fetchProfiles([course.teacher_id]);
        course.teacher = profileMap[course.teacher_id] || { id: course.teacher_id };

        // Lấy các lịch tuyển sinh đang mở
        const { data: schedules } = await supabaseAdmin
            .from('course_schedules')
            .select('id, name, start_date, duration_weeks, sessions_per_week, schedule, is_online, location, max_students, enrolled_count, price, requires_payment, status')
            .eq('course_id', id)
            .eq('status', 'enrolling')
            .order('start_date', { ascending: true });

        // Thống kê review
        const { data: reviewStats } = await supabaseAdmin
            .from('course_reviews')
            .select('rating')
            .eq('course_id', id)
            .eq('status', 'published');

        const ratings = (reviewStats || []).map(r => r.rating);
        const avg_rating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;

        res.json({
            success: true,
            data: {
                ...course,
                open_schedules: schedules || [],
                review_summary: { avg_rating, total_reviews: ratings.length }
            }
        });
    } catch (e) {
        console.error('getCourseDetails error', e);
        res.status(500).json({ success: false, message: 'Lỗi lấy chi tiết khóa học', error: e.message });
    }
};

/** GET /api/courses/teacher/:teacherId — Khóa học public của 1 giáo viên */
CourseController.getTeacherCourses = async (req, res) => {
    try {
        const { teacherId } = req.params;
        const { data: courses, error } = await supabaseAdmin
            .from('courses')
            .select('id, title, description, price, level, category, thumbnail_url, cover_url, status, created_at')
            .eq('teacher_id', teacherId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: courses });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ─────────────────────────────────────────────
// TEACHER ENDPOINTS
// ─────────────────────────────────────────────

/** GET /api/courses/me/teaching — Tất cả khóa học của GV (mọi status) */
CourseController.getMyTeachingCourses = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { cursor, limit } = parsePagination(req.query);
        const { status } = req.query;

        let query = supabaseAdmin
            .from('courses')
            .select('*')
            .eq('teacher_id', teacherId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) query = query.lt('created_at', cursor);
        if (status) query = query.eq('status', status);

        const { data: courses, error } = await query;
        if (error) throw error;

        res.json({ success: true, ...buildPaginatedResponse(courses, limit) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách khóa học', error: e.message });
    }
};

/** POST /api/courses — Tạo khóa học mới (Template) */
CourseController.createCourse = async (req, res) => {
    try {
        if (!validateTeacherRole(req, res)) return;

        const teacherId = req.user.id;
        const {
            title, description, price,
            level, category,
            thumbnail_url, cover_url, demo_video_url,
            objectives, requirements, syllabus, musicxml_files,
            duration_weeks
        } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: 'Tiêu đề khóa học là bắt buộc' });
        }

        const { data, error } = await supabaseAdmin
            .from('courses')
            .insert({
                teacher_id:     teacherId,
                title:          title.trim(),
                description:    description?.trim(),
                price:          price || 0,
                duration_weeks: duration_weeks || 8,
                level:          level || null,
                category:       category || null,
                thumbnail_url:  thumbnail_url || null,
                cover_url:      cover_url || null,
                demo_video_url: demo_video_url || null,
                objectives:     objectives || [],
                requirements:   requirements || [],
                syllabus:       syllabus || [],
                musicxml_files: musicxml_files || [],
                status:         'draft'
            })
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Tạo khóa học thành công', data });
    } catch (e) {
        console.error('createCourse error', e);
        res.status(500).json({ success: false, message: 'Lỗi tạo khóa học', error: e.message });
    }
};

/** PUT /api/courses/:id — Cập nhật khóa học (KHÔNG bị khóa sau publish, luôn sửa được) */
CourseController.updateCourse = async (req, res) => {
    try {
        if (!validateTeacherRole(req, res)) return;

        const { id } = req.params;
        const teacherId = req.user.id;

        // Kiểm tra quyền sở hữu
        const { data: course } = await supabaseAdmin
            .from('courses')
            .select('id, teacher_id, status')
            .eq('id', id)
            .single();

        if (!course) return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
        if (course.teacher_id !== teacherId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa khóa học này' });
        }

        // Chỉ cho phép sửa các trường nội dung
        const allowedFields = [
            'title', 'description', 'price', 'duration_weeks',
            'level', 'category',
            'thumbnail_url', 'cover_url', 'demo_video_url',
            'objectives', 'requirements', 'syllabus', 'musicxml_files'
        ];

        const updates = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('courses')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Cập nhật khóa học thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật khóa học', error: e.message });
    }
};

/** PUT /api/courses/:id/activate — Chuyển sang active (có thể mở lớp) */
CourseController.activateCourse = async (req, res) => {
    try {
        if (!validateTeacherRole(req, res)) return;

        const { id } = req.params;
        const { data: course } = await supabaseAdmin.from('courses').select('teacher_id, status, title').eq('id', id).single();

        if (!course) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (course.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (course.status === 'active')
            return res.status(400).json({ success: false, message: 'Khóa học đã ở trạng thái active' });
        if (!course.title)
            return res.status(400).json({ success: false, message: 'Khóa học cần có tiêu đề trước khi active' });

        const { data, error } = await supabaseAdmin
            .from('courses')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Khóa học đã được kích hoạt, giờ có thể mở lịch tuyển sinh', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi kích hoạt khóa học', error: e.message });
    }
};

/** PUT /api/courses/:id/archive — Lưu trữ khóa học (không mở lớp mới được) */
CourseController.archiveCourse = async (req, res) => {
    try {
        if (!validateTeacherRole(req, res)) return;

        const { id } = req.params;
        const { data: course } = await supabaseAdmin.from('courses').select('teacher_id, status').eq('id', id).single();

        if (!course) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (course.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        // Kiểm tra không có lớp đang ongoing
        const { count } = await supabaseAdmin
            .from('course_classes')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', id)
            .eq('status', 'ongoing');

        if (count > 0)
            return res.status(400).json({ success: false, message: `Có ${count} lớp đang diễn ra. Không thể lưu trữ khóa học.` });

        const { data, error } = await supabaseAdmin
            .from('courses')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, title, status')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Khóa học đã được lưu trữ', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lưu trữ khóa học', error: e.message });
    }
};

/** DELETE /api/courses/:id — Xóa khóa học (chỉ khi draft, không có class nào) */
CourseController.deleteCourse = async (req, res) => {
    try {
        if (!validateTeacherRole(req, res)) return;

        const { id } = req.params;
        const { data: course } = await supabaseAdmin.from('courses').select('teacher_id, status').eq('id', id).single();

        if (!course) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (course.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        // Kiểm tra không có class nào
        const { count } = await supabaseAdmin
            .from('course_classes')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', id);

        if (count > 0)
            return res.status(400).json({ success: false, message: `Không thể xóa: khóa học đã có ${count} lớp học liên kết. Hãy lưu trữ thay vì xóa.` });

        const { error } = await supabaseAdmin.from('courses').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Xóa khóa học thành công' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi xóa khóa học', error: e.message });
    }
};

/** GET /api/courses/:id/enrollments — Xem học viên đang enrolled vào tất cả lớp của khóa */
CourseController.getCourseEnrollments = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: course } = await supabaseAdmin.from('courses').select('teacher_id').eq('id', id).single();
        if (!course || (course.teacher_id !== req.user.id && req.user.role !== 'admin'))
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        const { data: enrollments, error } = await supabaseAdmin
            .from('course_enrollments')
            .select(`
                id, status, payment_verified, created_at,
                class:course_classes(id, name, start_date, status)
            `)
            .eq('course_id', id)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const userIds = enrollments.map(e => e.user_id);
        const profileMap = await fetchProfiles(userIds);
        const enriched = enrollments.map(e => ({ ...e, user: profileMap[e.user_id] || { id: e.user_id } }));

        res.json({ success: true, data: enriched });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ─────────────────────────────────────────────
// STUDENT ENDPOINTS
// ─────────────────────────────────────────────

/** GET /api/courses/me/enrolled — Khóa học đang tham gia của học viên */
CourseController.getMyEnrolledCourses = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: enrollments, error } = await supabaseAdmin
            .from('course_enrollments')
            .select(`
                id, status, payment_verified, created_at,
                course:courses(id, title, description, thumbnail_url, cover_url, level, category, price),
                class:course_classes(id, name, start_date, end_date, status, is_online, location)
            `)
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const teacherIds = [...new Set(enrollments.map(e => e.course?.teacher_id).filter(Boolean))];
        const profileMap = await fetchProfiles(teacherIds);

        const data = enrollments.map(e => ({
            enrollment_id: e.id,
            payment_verified: e.payment_verified,
            enrolled_at: e.created_at,
            course: e.course
                ? { ...e.course, teacher: profileMap[e.course.teacher_id] || { id: e.course.teacher_id } }
                : null,
            class: e.class || null
        }));

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ─────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────

/** GET /api/courses/admin/stats — Thống kê tổng quan (Admin) */
CourseController.getAdminStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Admin only' });

        const [
            { count: totalCourses },
            { count: activeCourses },
            { count: totalClasses },
            { count: totalEnrollments }
        ] = await Promise.all([
            supabaseAdmin.from('courses').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
            supabaseAdmin.from('course_classes').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active')
        ]);

        res.json({
            success: true,
            data: { totalCourses, activeCourses, totalClasses, totalEnrollments }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi thống kê', error: e.message });
    }
};

module.exports = CourseController;
