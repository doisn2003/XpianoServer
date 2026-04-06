/**
 * courseReviewController.js
 * Quản lý đánh giá khóa học/lớp học.
 * Học viên chỉ review được sau khi lớp hoàn thành (completed).
 */
const { supabaseAdmin } = require('../utils/supabaseClient');

const CourseReviewController = {};

/** POST /api/classes/:classId/reviews — Học viên đánh giá lớp học */
CourseReviewController.createReview = async (req, res) => {
    try {
        const { classId } = req.params;
        const studentId = req.user.id;
        const { rating, comment, is_anonymous, rating_content, rating_teacher, rating_interaction } = req.body;

        if (!rating || rating < 1 || rating > 5)
            return res.status(400).json({ success: false, message: 'rating phải từ 1 đến 5' });

        // Kiểm tra có enrollment không
        const { data: enrollment } = await supabaseAdmin
            .from('course_enrollments')
            .select('id')
            .eq('class_id', classId)
            .eq('user_id', studentId)
            .eq('status', 'active')
            .single();

        if (!enrollment)
            return res.status(403).json({ success: false, message: 'Bạn phải tham gia lớp học này mới có thể đánh giá' });

        // Lấy course_id từ class
        const { data: cls } = await supabaseAdmin
            .from('course_classes')
            .select('course_id, status')
            .eq('id', classId)
            .single();

        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' });

        const { data, error } = await supabaseAdmin
            .from('course_reviews')
            .insert({
                class_id:           classId,
                course_id:          cls.course_id,
                student_id:         studentId,
                rating:             parseInt(rating),
                comment:            comment || null,
                is_anonymous:       is_anonymous || false,
                rating_content:     rating_content ? parseInt(rating_content) : null,
                rating_teacher:     rating_teacher ? parseInt(rating_teacher) : null,
                rating_interaction: rating_interaction ? parseInt(rating_interaction) : null,
                status:             'published'
            })
            .select('*')
            .single();

        if (error) {
            if (error.code === '23505') // unique violation
                return res.status(400).json({ success: false, message: 'Bạn đã đánh giá lớp học này rồi' });
            throw error;
        }

        res.status(201).json({ success: true, message: 'Đánh giá thành công', data });
    } catch (e) {
        console.error('createReview error', e);
        res.status(500).json({ success: false, message: 'Lỗi gửi đánh giá', error: e.message });
    }
};

/** PUT /api/reviews/:id — Học viên sửa đánh giá của mình */
CourseReviewController.updateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: review } = await supabaseAdmin.from('course_reviews').select('student_id').eq('id', id).single();

        if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
        if (review.student_id !== req.user.id) return res.status(403).json({ success: false, message: 'Không có quyền' });

        const allowed = ['rating', 'comment', 'is_anonymous', 'rating_content', 'rating_teacher', 'rating_interaction'];
        const updates = {};
        allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin.from('course_reviews').update(updates).eq('id', id).select('*').single();
        if (error) throw error;
        res.json({ success: true, message: 'Cập nhật đánh giá thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/courses/:courseId/reviews — Tất cả đánh giá của 1 khóa học */
CourseReviewController.getCourseReviews = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { data: reviews, error } = await supabaseAdmin
            .from('course_reviews')
            .select('id, rating, comment, is_anonymous, rating_content, rating_teacher, rating_interaction, created_at, student_id')
            .eq('course_id', courseId)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Ẩn student info nếu is_anonymous
        const studentIds = reviews.filter(r => !r.is_anonymous).map(r => r.student_id);
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', studentIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        const data = reviews.map(r => ({
            ...r,
            student: r.is_anonymous ? null : (profileMap[r.student_id] || null),
            student_id: undefined // ẩn id gốc
        }));

        // Tính avg
        const ratings = reviews.map(r => r.rating);
        const avg_rating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;

        res.json({ success: true, data, summary: { avg_rating, total: ratings.length } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/classes/:classId/reviews — Reviews của 1 lớp học */
CourseReviewController.getClassReviews = async (req, res) => {
    try {
        const { classId } = req.params;
        const { data: reviews, error } = await supabaseAdmin
            .from('course_reviews')
            .select('id, rating, comment, is_anonymous, rating_content, rating_teacher, rating_interaction, created_at, student_id')
            .eq('class_id', classId)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const studentIds = reviews.filter(r => !r.is_anonymous).map(r => r.student_id);
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', studentIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        const data = reviews.map(r => ({
            ...r,
            student: r.is_anonymous ? null : (profileMap[r.student_id] || null),
            student_id: undefined
        }));

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** PUT /api/admin/reviews/:id/status — Admin kiểm duyệt review */
CourseReviewController.moderateReview = async (req, res) => {
    try {
        if (req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Admin only' });

        const { id } = req.params;
        const { status } = req.body;
        if (!['published', 'hidden', 'flagged'].includes(status))
            return res.status(400).json({ success: false, message: 'Status không hợp lệ' });

        const { data, error } = await supabaseAdmin
            .from('course_reviews')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, status')
            .single();

        if (error) throw error;
        res.json({ success: true, message: `Review đã được chuyển sang "${status}"`, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

module.exports = CourseReviewController;
