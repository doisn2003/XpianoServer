/**
 * classController.js
 * Quản lý Lớp học (CourseClass) — Instance thực sự của khóa học.
 * Bao gồm: xem danh sách học viên, cập nhật trạng thái lớp, quản lý thông báo.
 */
const { supabaseAdmin } = require('../utils/supabaseClient');

const ClassController = {};

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────
async function checkClassAccess(classId, userId, role) {
    const { data: cls } = await supabaseAdmin
        .from('course_classes')
        .select('id, teacher_id, status, course_id, name')
        .eq('id', classId)
        .single();

    if (!cls) return { error: 'Không tìm thấy lớp học', status: 404 };
    if (role === 'admin') return { cls, isTeacher: true };
    if (cls.teacher_id === userId) return { cls, isTeacher: true };

    // Kiểm tra có phải học viên enrolled không
    const { data: enrollment } = await supabaseAdmin
        .from('course_enrollments')
        .select('id, status')
        .eq('class_id', classId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

    if (enrollment) return { cls, isTeacher: false, enrollment };
    return { error: 'Không có quyền truy cập lớp học này', status: 403 };
}

// ─────────────────────────────────────────────
// CLASS ENDPOINTS
// ─────────────────────────────────────────────

/** GET /api/classes/:id — Chi tiết lớp học */
ClassController.getClass = async (req, res) => {
    try {
        const { id } = req.params;
        const { error, status, cls, isTeacher } = await checkClassAccess(id, req.user.id, req.user.role);
        if (error) return res.status(status).json({ success: false, message: error });

        const { data, error: fetchErr } = await supabaseAdmin
            .from('course_classes')
            .select(`
                *,
                course:courses(id, title, description, level, category, thumbnail_url, cover_url, demo_video_url, syllabus, musicxml_files, objectives),
                schedule:course_schedules(id, name, start_date, schedule, duration_weeks)
            `)
            .eq('id', id)
            .single();

        if (fetchErr) throw fetchErr;

        // Thống kê nhanh
        const [
            { count: totalStudents },
            { count: totalSessions },
            { count: completedSessions }
        ] = await Promise.all([
            supabaseAdmin.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('class_id', id).eq('status', 'active'),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('class_id', id),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('class_id', id).eq('status', 'ended')
        ]);

        res.json({
            success: true,
            data: { ...data, stats: { totalStudents, totalSessions, completedSessions }, is_teacher: isTeacher }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lấy thông tin lớp học', error: e.message });
    }
};

/** GET /api/classes/:id/students — Danh sách học viên + tiến độ (teacher only) */
ClassController.getClassStudents = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id').eq('id', id).single();

        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' });
        if (cls.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Chỉ giáo viên mới có thể xem danh sách học viên' });

        const { data: enrollments, error } = await supabaseAdmin
            .from('course_enrollments')
            .select('id, user_id, status, payment_verified, created_at')
            .eq('class_id', id)
            .eq('status', 'active')
            .order('created_at', { ascending: true });

        if (error) throw error;

        const userIds = enrollments.map(e => e.user_id);
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, avatar_url, email')
            .in('id', userIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        // Lấy tiến độ học viên
        const { data: progressList } = await supabaseAdmin
            .from('student_learning_progress')
            .select('student_id, sessions_attended, sessions_total, assignments_submitted, assignments_total, avg_grade, total_learning_minutes, progress_status')
            .eq('class_id', id)
            .in('student_id', userIds);
        const progressMap = Object.fromEntries((progressList || []).map(p => [p.student_id, p]));

        const data = enrollments.map(e => ({
            enrollment_id:    e.id,
            payment_verified: e.payment_verified,
            enrolled_at:      e.created_at,
            student:          profileMap[e.user_id] || { id: e.user_id },
            progress:         progressMap[e.user_id] || null
        }));

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách học viên', error: e.message });
    }
};

/** PUT /api/classes/:id/status — Cập nhật trạng thái lớp (teacher/admin) */
ClassController.updateClassStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['upcoming', 'ongoing', 'completed', 'cancelled'];

        if (!validStatuses.includes(status))
            return res.status(400).json({ success: false, message: `Status không hợp lệ. Chỉ nhận: ${validStatuses.join(', ')}` });

        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id, status').eq('id', id).single();
        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' });
        if (cls.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        const { data, error } = await supabaseAdmin
            .from('course_classes')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, name, status')
            .single();

        if (error) throw error;
        res.json({ success: true, message: `Cập nhật trạng thái lớp → "${status}" thành công`, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/classes — Lớp học của GV đang đăng nhập */
ClassController.getMyTeachingClasses = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { status } = req.query;

        let query = supabaseAdmin
            .from('course_classes')
            .select(`
                id, name, start_date, end_date, is_online, location, status, created_at,
                course:courses(id, title, thumbnail_url, level, category)
            `)
            .eq('teacher_id', teacherId)
            .order('start_date', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;

        // Đếm học viên cho mỗi lớp
        const classIds = data.map(c => c.id);
        const countPromises = classIds.map(cid =>
            supabaseAdmin.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('class_id', cid).eq('status', 'active')
        );
        const counts = await Promise.all(countPromises);

        const result = data.map((cls, i) => ({ ...cls, enrolled_count: counts[i].count || 0 }));
        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/student/classes — Lớp học đang tham gia của học viên */
ClassController.getMyEnrolledClasses = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabaseAdmin
            .from('course_enrollments')
            .select(`
                id, payment_verified, created_at,
                class:course_classes(
                    id, name, start_date, end_date, is_online, location, status,
                    course:courses(id, title, thumbnail_url, level, category)
                )
            `)
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ─────────────────────────────────────────────
// ANNOUNCEMENTS
// ─────────────────────────────────────────────

/** POST /api/classes/:classId/announcements — Tạo thông báo */
ClassController.createAnnouncement = async (req, res) => {
    try {
        const { classId } = req.params;
        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id').eq('id', classId).single();

        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp' });
        if (cls.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Chỉ giáo viên mới có thể đăng thông báo' });

        const { title, content, attachment_urls, is_pinned } = req.body;
        if (!title || !content)
            return res.status(400).json({ success: false, message: 'Thiếu title hoặc content' });

        const { data, error } = await supabaseAdmin
            .from('class_announcements')
            .insert({
                class_id:        classId,
                teacher_id:      req.user.id,
                title:           title.trim(),
                content,
                attachment_urls: attachment_urls || [],
                is_pinned:       is_pinned || false
            })
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Đăng thông báo thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi tạo thông báo', error: e.message });
    }
};

/** GET /api/classes/:classId/announcements — Danh sách thông báo (pinned first) */
ClassController.getAnnouncements = async (req, res) => {
    try {
        const { classId } = req.params;
        const { error: accessError, status: accessStatus } = await checkClassAccess(classId, req.user.id, req.user.role);
        if (accessError) return res.status(accessStatus).json({ success: false, message: accessError });

        const { data, error } = await supabaseAdmin
            .from('class_announcements')
            .select('*')
            .eq('class_id', classId)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** PUT /api/announcements/:id — Sửa thông báo */
ClassController.updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: ann } = await supabaseAdmin.from('class_announcements').select('teacher_id').eq('id', id).single();

        if (!ann) return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
        if (ann.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        const { title, content, attachment_urls, is_pinned } = req.body;
        const updates = {};
        if (title !== undefined) updates.title = title.trim();
        if (content !== undefined) updates.content = content;
        if (attachment_urls !== undefined) updates.attachment_urls = attachment_urls;
        if (is_pinned !== undefined) updates.is_pinned = is_pinned;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin.from('class_announcements').update(updates).eq('id', id).select('*').single();
        if (error) throw error;
        res.json({ success: true, message: 'Cập nhật thông báo thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** DELETE /api/announcements/:id — Xóa thông báo */
ClassController.deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: ann } = await supabaseAdmin.from('class_announcements').select('teacher_id').eq('id', id).single();

        if (!ann) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (ann.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        await supabaseAdmin.from('class_announcements').delete().eq('id', id);
        res.json({ success: true, message: 'Xóa thông báo thành công' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

module.exports = ClassController;
