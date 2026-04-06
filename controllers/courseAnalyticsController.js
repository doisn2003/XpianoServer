/**
 * courseAnalyticsController.js
 * Thống kê & Doanh thu cho Giáo viên và Admin.
 * Đọc từ views: v_course_overview, v_teacher_monthly_dashboard
 * va các bảng: teacher_revenue_summary, student_learning_progress, course_reviews
 */
const { supabaseAdmin } = require('../utils/supabaseClient');

const CourseAnalyticsController = {};

// ───────────────────────────────────────────────
// TEACHER ANALYTICS
// ───────────────────────────────────────────────

/** GET /api/teacher/analytics/overview — Tổng overview của GV */
CourseAnalyticsController.teacherOverview = async (req, res) => {
    try {
        const teacherId = req.user.id;

        const [
            { count: totalCourses },
            { count: activeCourses },
            { count: totalClasses },
            { count: ongoingClasses },
            { count: totalStudents }
        ] = await Promise.all([
            supabaseAdmin.from('courses').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId),
            supabaseAdmin.from('courses').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'active'),
            supabaseAdmin.from('course_classes').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId),
            supabaseAdmin.from('course_classes').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('status', 'ongoing'),
            supabaseAdmin.from('course_enrollments').select('id', { count: 'exact', head: true })
                .in('class_id',
                    supabaseAdmin.from('course_classes').select('id').eq('teacher_id', teacherId)
                ).eq('status', 'active')
        ]);

        // Tổng doanh thu lifetime từ teacher_revenue_summary
        const { data: revSummary } = await supabaseAdmin
            .from('teacher_revenue_summary')
            .select('gross_revenue, net_revenue, platform_fee')
            .eq('teacher_id', teacherId);

        const lifetime_gross = (revSummary || []).reduce((a, b) => a + parseFloat(b.gross_revenue || 0), 0);
        const lifetime_net   = (revSummary || []).reduce((a, b) => a + parseFloat(b.net_revenue || 0), 0);

        // Avg rating
        const { data: reviews } = await supabaseAdmin
            .from('course_reviews')
            .select('rating')
            .in('course_id', supabaseAdmin.from('courses').select('id').eq('teacher_id', teacherId))
            .eq('status', 'published');

        const ratings = (reviews || []).map(r => r.rating);
        const avg_rating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;

        res.json({
            success: true,
            data: {
                courses:   { total: totalCourses, active: activeCourses },
                classes:   { total: totalClasses, ongoing: ongoingClasses },
                students:  { total: totalStudents },
                revenue:   { lifetime_gross, lifetime_net },
                rating:    { avg_rating, total_reviews: ratings.length }
            }
        });
    } catch (e) {
        console.error('teacherOverview error', e);
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/analytics/revenue?year=&month= — Doanh thu tháng cụ thể */
CourseAnalyticsController.teacherMonthlyRevenue = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const year  = parseInt(req.query.year)  || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;

        const { data, error } = await supabaseAdmin
            .from('teacher_revenue_summary')
            .select('*')
            .eq('teacher_id', teacherId)
            .eq('period_year', year)
            .eq('period_month', month)
            .single();

        // Breakdown theo lớp học trong tháng
        const startOfMonth = new Date(year, month - 1, 1).toISOString();
        const endOfMonth   = new Date(year, month, 0, 23, 59, 59).toISOString();

        const { data: classes } = await supabaseAdmin
            .from('course_classes')
            .select(`
                id, name, start_date, status,
                course:courses(id, title)
            `)
            .eq('teacher_id', teacherId)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

        res.json({
            success: true,
            data: {
                summary: data || {
                    period_year: year, period_month: month,
                    gross_revenue: 0, net_revenue: 0, platform_fee: 0,
                    total_classes: 0, total_students: 0, avg_rating: null
                },
                classes_this_month: classes || []
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/analytics/revenue/chart?range=12 — Biểu đồ 12 tháng */
CourseAnalyticsController.teacherRevenueChart = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const range = Math.min(parseInt(req.query.range) || 12, 24);

        const { data, error } = await supabaseAdmin
            .from('teacher_revenue_summary')
            .select('period_year, period_month, gross_revenue, net_revenue, platform_fee, total_students, avg_rating')
            .eq('teacher_id', teacherId)
            .order('period_year', { ascending: false })
            .order('period_month', { ascending: false })
            .limit(range);

        if (error) throw error;
        res.json({ success: true, data: (data || []).reverse() }); // Chronological order
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/analytics/courses — Ranking khóa học theo doanh thu */
CourseAnalyticsController.teacherCourseRanking = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const sortBy = req.query.sort || 'revenue'; // revenue | rating | enrollments

        const { data: courses, error } = await supabaseAdmin
            .from('v_course_overview')
            .select('*')
            .eq('teacher_id', teacherId);

        if (error) throw error;

        const sortFn = {
            revenue:     (a, b) => (b.lifetime_net_revenue || 0) - (a.lifetime_net_revenue || 0),
            rating:      (a, b) => (b.avg_rating || 0) - (a.avg_rating || 0),
            enrollments: (a, b) => (b.total_enrollments || 0) - (a.total_enrollments || 0)
        }[sortBy] || (() => 0);

        res.json({ success: true, data: (courses || []).sort(sortFn) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/analytics/classes/:classId — Phân tích chi tiết 1 lớp */
CourseAnalyticsController.teacherClassAnalytics = async (req, res) => {
    try {
        const { classId } = req.params;
        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id').eq('id', classId).single();

        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp' });
        if (cls.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        const [
            { count: totalStudents },
            { count: atRiskStudents },
            { count: totalSessions },
            { count: completedSessions },
            { count: totalAssignments },
            { count: totalSubmissions }
        ] = await Promise.all([
            supabaseAdmin.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'active'),
            supabaseAdmin.from('student_learning_progress').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('progress_status', 'at_risk'),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('class_id', classId),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'ended'),
            supabaseAdmin.from('class_assignments').select('id', { count: 'exact', head: true }).eq('class_id', classId),
            supabaseAdmin.from('class_assignment_submissions').select('id', { count: 'exact', head: true })
                .in('assignment_id', supabaseAdmin.from('class_assignments').select('id').eq('class_id', classId))
        ]);

        // Reviews
        const { data: reviews } = await supabaseAdmin.from('course_reviews').select('rating').eq('class_id', classId).eq('status', 'published');
        const ratings = (reviews || []).map(r => r.rating);
        const avg_rating = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

        // Snapshot doanh thu mới nhất
        const { data: revenueSnap } = await supabaseAdmin
            .from('course_revenue_snapshots')
            .select('gross_revenue, net_revenue, platform_fee')
            .eq('class_id', classId)
            .order('snapshot_at', { ascending: false })
            .limit(1)
            .single();

        res.json({
            success: true,
            data: {
                students:    { total: totalStudents, at_risk: atRiskStudents },
                sessions:    { total: totalSessions, completed: completedSessions,
                               completion_rate: totalSessions > 0 ? Math.round(completedSessions / totalSessions * 100) : 0 },
                assignments: { total: totalAssignments, submissions: totalSubmissions,
                               submission_rate: totalAssignments > 0 && totalStudents > 0
                                   ? Math.round(totalSubmissions / (totalAssignments * totalStudents) * 100) : 0 },
                rating:      { avg_rating, total_reviews: ratings.length },
                revenue:     revenueSnap || { gross_revenue: 0, net_revenue: 0, platform_fee: 0 }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/analytics/students/:classId — Tiến độ từng học viên */
CourseAnalyticsController.teacherStudentProgress = async (req, res) => {
    try {
        const { classId } = req.params;
        const { data: cls } = await supabaseAdmin.from('course_classes').select('teacher_id').eq('id', classId).single();

        if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (cls.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });

        const { data, error } = await supabaseAdmin
            .from('v_class_student_progress')
            .select('*')
            .eq('class_id', classId)
            .order('progress_status');

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/teacher/analytics/reviews — Danh sách đánh giá của GV */
CourseAnalyticsController.teacherReviews = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { courseId, rating } = req.query;

        const courseIds = courseId
            ? [courseId]
            : (await supabaseAdmin.from('courses').select('id').eq('teacher_id', teacherId)).data?.map(c => c.id);

        let query = supabaseAdmin
            .from('course_reviews')
            .select(`
                id, rating, comment, is_anonymous, rating_content, rating_teacher, rating_interaction,
                created_at, student_id,
                course:courses(id, title)
            `)
            .in('course_id', courseIds || [])
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (rating) query = query.eq('rating', parseInt(rating));

        const { data: reviews, error } = await query;
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

// ───────────────────────────────────────────────
// ADMIN ANALYTICS
// ───────────────────────────────────────────────

/** GET /api/admin/analytics/revenue/overview — Tổng doanh thu nền tảng */
CourseAnalyticsController.adminRevenueOverview = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

        const { year, month } = req.query;

        let query = supabaseAdmin.from('teacher_revenue_summary').select('gross_revenue, net_revenue, platform_fee, refunded_amount');
        if (year) query = query.eq('period_year', parseInt(year));
        if (month) query = query.eq('period_month', parseInt(month));

        const { data, error } = await query;
        if (error) throw error;

        const totals = (data || []).reduce((acc, row) => ({
            total_gross:    acc.total_gross    + parseFloat(row.gross_revenue || 0),
            total_net:      acc.total_net      + parseFloat(row.net_revenue || 0),
            total_fee:      acc.total_fee      + parseFloat(row.platform_fee || 0),
            total_refunded: acc.total_refunded + parseFloat(row.refunded_amount || 0)
        }), { total_gross: 0, total_net: 0, total_fee: 0, total_refunded: 0 });

        res.json({ success: true, data: { ...totals, period: { year, month } } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/admin/analytics/revenue/teachers?year=&month= — Bảng xếp hạng GV */
CourseAnalyticsController.adminTeacherRanking = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

        const { year, month } = req.query;
        const currentYear  = parseInt(year)  || new Date().getFullYear();
        const currentMonth = parseInt(month) || new Date().getMonth() + 1;

        const { data, error } = await supabaseAdmin
            .from('v_teacher_monthly_dashboard')
            .select('*')
            .eq('period_year', currentYear)
            .eq('period_month', currentMonth)
            .order('gross_revenue', { ascending: false });

        if (error) throw error;

        const teacherIds = (data || []).map(r => r.teacher_id);
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', teacherIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

        const enriched = (data || []).map(r => ({ ...r, teacher: profileMap[r.teacher_id] || { id: r.teacher_id } }));
        res.json({ success: true, data: enriched, period: { year: currentYear, month: currentMonth } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/admin/analytics/revenue/breakdown/:teacherId?year= — Doanh thu theo tháng của 1 GV */
CourseAnalyticsController.adminTeacherBreakdown = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

        const { teacherId } = req.params;
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const { data, error } = await supabaseAdmin
            .from('teacher_revenue_summary')
            .select('*')
            .eq('teacher_id', teacherId)
            .eq('period_year', year)
            .order('period_month');

        if (error) throw error;

        const { data: profile } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').eq('id', teacherId).single();
        res.json({ success: true, data, teacher: profile, year });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/admin/analytics/courses/top — Top khóa học */
CourseAnalyticsController.adminTopCourses = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

        const sortBy = req.query.sort || 'revenue';
        const limit  = Math.min(parseInt(req.query.limit) || 10, 50);

        const { data, error } = await supabaseAdmin
            .from('v_course_overview')
            .select('*')
            .limit(limit);

        if (error) throw error;

        const sortFn = {
            revenue:     (a, b) => (b.lifetime_gross_revenue || 0) - (a.lifetime_gross_revenue || 0),
            rating:      (a, b) => (b.avg_rating || 0) - (a.avg_rating || 0),
            enrollments: (a, b) => (b.total_enrollments || 0) - (a.total_enrollments || 0)
        }[sortBy] || (() => 0);

        res.json({ success: true, data: (data || []).sort(sortFn).slice(0, limit) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** GET /api/admin/analytics/platform/summary — KPIs nền tảng */
CourseAnalyticsController.adminPlatformSummary = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

        const [
            { count: totalCourses },
            { count: totalClasses },
            { count: ongoingClasses },
            { count: totalTeachers },
            { count: totalStudents },
            { count: totalEnrollments }
        ] = await Promise.all([
            supabaseAdmin.from('courses').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('course_classes').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('course_classes').select('id', { count: 'exact', head: true }).eq('status', 'ongoing'),
            supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
            supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
            supabaseAdmin.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active')
        ]);

        res.json({
            success: true,
            data: { totalCourses, totalClasses, ongoingClasses, totalTeachers, totalStudents, totalEnrollments }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

module.exports = CourseAnalyticsController;
