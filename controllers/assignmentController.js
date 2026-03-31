/**
 * assignmentController.js
 * Quản lý Bài tập (ClassAssignment) & Nộp bài (ClassAssignmentSubmission).
 */
const { supabaseAdmin } = require('../utils/supabaseClient');

const AssignmentController = {};

async function isEnrolled(classId, userId) {
    const { data } = await supabaseAdmin
        .from('course_enrollments')
        .select('id')
        .eq('class_id', classId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();
    return !!data;
}

// ─────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────

/** POST /api/classes/:classId/assignments — Giao bài tập */
AssignmentController.createAssignment = async (req, res) => {
    try {
        const { classId } = req.params;
        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id').eq('id', classId).single();

        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' });
        if (cls.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Chỉ giáo viên mới có thể giao bài' });

        const { title, description, musicxml_url, attachment_urls, due_date, session_id } = req.body;
        if (!title) return res.status(400).json({ success: false, message: 'Tiêu đề bài tập là bắt buộc' });

        const { data, error } = await supabaseAdmin
            .from('class_assignments')
            .insert({
                class_id:        classId,
                teacher_id:      req.user.id,
                session_id:      session_id || null,
                title:           title.trim(),
                description:     description || null,
                musicxml_url:    musicxml_url || null,
                attachment_urls: attachment_urls || [],
                due_date:        due_date || null
            })
            .select('*')
            .single();

        if (error) throw error;

        // Cập nhật assignments_total trong student_learning_progress
        await supabaseAdmin.rpc('increment_assignments_total', { p_class_id: classId }).catch(() => {
            // Nếu function chưa tồn tại, update thủ công
            supabaseAdmin
                .from('student_learning_progress')
                .update({ assignments_total: supabaseAdmin.raw('assignments_total + 1') })
                .eq('class_id', classId)
                .catch(console.error);
        });

        res.status(201).json({ success: true, message: 'Giao bài tập thành công', data });
    } catch (e) {
        console.error('createAssignment error', e);
        res.status(500).json({ success: false, message: 'Lỗi tạo bài tập', error: e.message });
    }
};

/** GET /api/classes/:classId/assignments — Danh sách bài tập */
AssignmentController.getAssignments = async (req, res) => {
    try {
        const { classId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id').eq('id', classId).single();
        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' });

        const isTeacher = cls.teacher_id === userId || userRole === 'admin';
        if (!isTeacher && !(await isEnrolled(classId, userId)))
            return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });

        const { data: assignments, error } = await supabaseAdmin
            .from('class_assignments')
            .select('*, session:live_sessions(id, title, scheduled_at)')
            .eq('class_id', classId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Nếu là student, kèm trạng thái nộp bài của họ
        if (!isTeacher) {
            const assignmentIds = assignments.map(a => a.id);
            const { data: submissions } = await supabaseAdmin
                .from('class_assignment_submissions')
                .select('assignment_id, grade, reviewed_at, created_at')
                .eq('student_id', userId)
                .in('assignment_id', assignmentIds);

            const submissionMap = Object.fromEntries((submissions || []).map(s => [s.assignment_id, s]));
            const enriched = assignments.map(a => ({
                ...a,
                my_submission: submissionMap[a.id] || null
            }));
            return res.json({ success: true, data: enriched });
        }

        res.json({ success: true, data: assignments });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/assignments/:id — Chi tiết bài tập */
AssignmentController.getAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabaseAdmin
            .from('class_assignments')
            .select('*, class:course_classes(id, name, teacher_id)')
            .eq('id', id)
            .single();

        if (error || !data) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' });

        const userId = req.user.id;
        const isTeacher = data.class.teacher_id === userId || req.user.role === 'admin';
        if (!isTeacher && !(await isEnrolled(data.class_id, userId)))
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** PUT /api/assignments/:id — Cập nhật bài tập (teacher) */
AssignmentController.updateAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: assign } = await supabaseAdmin.from('class_assignments').select('teacher_id').eq('id', id).single();

        if (!assign) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (assign.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        const allowed = ['title', 'description', 'musicxml_url', 'attachment_urls', 'due_date'];
        const updates = {};
        allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin.from('class_assignments').update(updates).eq('id', id).select('*').single();
        if (error) throw error;
        res.json({ success: true, message: 'Cập nhật bài tập thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** DELETE /api/assignments/:id — Xóa bài tập (teacher) */
AssignmentController.deleteAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: assign } = await supabaseAdmin.from('class_assignments').select('teacher_id').eq('id', id).single();

        if (!assign) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (assign.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        await supabaseAdmin.from('class_assignments').delete().eq('id', id);
        res.json({ success: true, message: 'Xóa bài tập thành công' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ─────────────────────────────────────────────
// SUBMISSIONS
// ─────────────────────────────────────────────

/** POST /api/assignments/:id/submit — Học viên nộp bài */
AssignmentController.submitAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = req.user.id;

        const { data: assign } = await supabaseAdmin
            .from('class_assignments')
            .select('id, class_id, due_date, title')
            .eq('id', id)
            .single();

        if (!assign) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' });
        if (!(await isEnrolled(assign.class_id, studentId)))
            return res.status(403).json({ success: false, message: 'Bạn chưa đăng ký lớp học này' });

        if (assign.due_date && new Date() > new Date(assign.due_date))
            return res.status(400).json({ success: false, message: 'Đã quá hạn nộp bài' });

        // Kiểm tra đã nộp chưa
        const { data: existing } = await supabaseAdmin
            .from('class_assignment_submissions')
            .select('id')
            .eq('assignment_id', id)
            .eq('student_id', studentId)
            .single();

        if (existing)
            return res.status(400).json({ success: false, message: 'Bạn đã nộp bài này rồi. Dùng PUT để chỉnh sửa.' });

        const { musicxml_url, attachment_urls, note } = req.body;

        const { data, error } = await supabaseAdmin
            .from('class_assignment_submissions')
            .insert({
                assignment_id:   id,
                student_id:      studentId,
                musicxml_url:    musicxml_url || null,
                attachment_urls: attachment_urls || [],
                note:            note || null
            })
            .select('*')
            .single();

        if (error) throw error;

        // Cập nhật assignments_submitted trong student_learning_progress
        await supabaseAdmin
            .from('student_learning_progress')
            .update({
                assignments_submitted: supabaseAdmin.raw('assignments_submitted + 1'),
                updated_at: new Date().toISOString()
            })
            .eq('class_id', assign.class_id)
            .eq('student_id', studentId)
            .catch(console.error);

        res.status(201).json({ success: true, message: 'Nộp bài thành công', data });
    } catch (e) {
        console.error('submitAssignment error', e);
        res.status(500).json({ success: false, message: 'Lỗi nộp bài', error: e.message });
    }
};

/** PUT /api/submissions/:id — Học viên sửa lại bài đã nộp (chỉ trước due_date và chưa được chấm) */
AssignmentController.updateSubmission = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: sub } = await supabaseAdmin
            .from('class_assignment_submissions')
            .select('student_id, reviewed_at, assignment:class_assignments(due_date)')
            .eq('id', id)
            .single();

        if (!sub) return res.status(404).json({ success: false, message: 'Không tìm thấy bài nộp' });
        if (sub.student_id !== req.user.id) return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (sub.reviewed_at) return res.status(400).json({ success: false, message: 'Bài đã được chấm, không thể chỉnh sửa' });
        if (sub.assignment?.due_date && new Date() > new Date(sub.assignment.due_date))
            return res.status(400).json({ success: false, message: 'Đã quá hạn nộp bài' });

        const { musicxml_url, attachment_urls, note } = req.body;
        const updates = {};
        if (musicxml_url !== undefined) updates.musicxml_url = musicxml_url;
        if (attachment_urls !== undefined) updates.attachment_urls = attachment_urls;
        if (note !== undefined) updates.note = note;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin.from('class_assignment_submissions').update(updates).eq('id', id).select('*').single();
        if (error) throw error;
        res.json({ success: true, message: 'Cập nhật bài nộp thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/assignments/:id/submissions — Tất cả bài nộp của 1 bài tập (teacher) */
AssignmentController.getSubmissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: assign } = await supabaseAdmin
            .from('class_assignments')
            .select('teacher_id, class_id, title')
            .eq('id', id)
            .single();

        if (!assign) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' });
        if (assign.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Chỉ giáo viên mới xem được bài nộp' });

        const { data: submissions, error } = await supabaseAdmin
            .from('class_assignment_submissions')
            .select('*')
            .eq('assignment_id', id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const studentIds = submissions.map(s => s.student_id);
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', studentIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        const data = submissions.map(s => ({ ...s, student: profileMap[s.student_id] || { id: s.student_id } }));
        res.json({ success: true, data, assignment_title: assign.title });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** PUT /api/submissions/:id/grade — Giáo viên chấm bài */
AssignmentController.gradeSubmission = async (req, res) => {
    try {
        const { id } = req.params;
        const { teacher_feedback, grade } = req.body;

        const { data: sub } = await supabaseAdmin
            .from('class_assignment_submissions')
            .select('student_id, assignment:class_assignments(teacher_id, class_id)')
            .eq('id', id)
            .single();

        if (!sub) return res.status(404).json({ success: false, message: 'Không tìm thấy bài nộp' });
        if (sub.assignment.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền chấm bài' });

        const { data, error } = await supabaseAdmin
            .from('class_assignment_submissions')
            .update({
                teacher_feedback: teacher_feedback || null,
                grade:            grade || null,
                reviewed_at:      new Date().toISOString(),
                updated_at:       new Date().toISOString()
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        // Cập nhật assignments_passed nếu có grade hợp lệ
        if (grade && !['needs_work', 'F', 'fail'].includes(grade.toLowerCase())) {
            await supabaseAdmin
                .from('student_learning_progress')
                .update({
                    assignments_passed: supabaseAdmin.raw('assignments_passed + 1'),
                    updated_at: new Date().toISOString()
                })
                .eq('class_id', sub.assignment.class_id)
                .eq('student_id', sub.student_id)
                .catch(console.error);
        }

        res.json({ success: true, message: 'Chấm bài thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi chấm bài', error: e.message });
    }
};

module.exports = AssignmentController;
