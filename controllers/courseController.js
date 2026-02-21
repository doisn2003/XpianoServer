const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const CourseController = {};

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

// ==========================================
// TEACHER ENDPOINTS
// ==========================================

CourseController.createCourse = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const {
            title, description, price, duration_weeks,
            sessions_per_week, max_students, start_date, schedule, thumbnail_url,
            is_online, location
        } = req.body;

        if (!title || !start_date || !schedule) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc: title, start_date, schedule' });
        }

        const { data, error } = await supabaseAdmin
            .from('courses')
            .insert({
                teacher_id: teacherId,
                title: title.trim(),
                description: description?.trim(),
                price: price || 0,
                duration_weeks: duration_weeks || 4,
                sessions_per_week: sessions_per_week || 2,
                max_students: max_students || 10,
                start_date,
                schedule,
                thumbnail_url,
                is_online: is_online !== false,
                location,
                status: 'draft'
            })
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Tạo khóa học thành công', data });
    } catch (e) {
        console.error('Error creating course', e);
        res.status(500).json({ success: false, message: 'Lỗi tạo khóa học', error: e.message });
    }
};

CourseController.updateCourse = async (req, res) => {
    try {
        const courseId = req.params.id;
        const teacherId = req.user.id;
        const updates = req.body;

        const { data: course } = await supabaseAdmin
            .from('courses')
            .select('teacher_id, status')
            .eq('id', courseId)
            .single();

        if (!course || course.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        }

        if (course.status === 'published') {
            return res.status(400).json({ success: false, message: 'Không thể sửa khóa học đã publish (hãy xem xét tạo khóa mới)' });
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('courses')
            .update(updates)
            .eq('id', courseId)
            .select('*')
            .single();

        if (error) throw error;
        res.status(200).json({ success: true, message: 'Cập nhật thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật khóa học', error: e.message });
    }
};

CourseController.publishCourse = async (req, res) => {
    try {
        const courseId = req.params.id;
        const teacherId = req.user.id;

        const { data: course } = await supabaseAdmin
            .from('courses')
            .select('*')
            .eq('id', courseId)
            .single();

        if (!course || course.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        }

        if (course.status === 'published') {
            return res.status(400).json({ success: false, message: 'Khóa học đã được publish' });
        }

        const startDate = new Date(course.start_date);
        const scheduleArr = course.schedule || [];
        const durationWeeks = course.duration_weeks || 4;

        if (scheduleArr.length === 0) {
            return res.status(400).json({ success: false, message: 'Lịch học trống' });
        }

        const sessionsToInsert = [];
        let sessionCount = 1;

        for (let w = 0; w < durationWeeks; w++) {
            for (const sch of scheduleArr) {
                let schDay = parseInt(sch.day_of_week);

                let startOfWeekW = new Date(startDate);
                startOfWeekW.setDate(startDate.getDate() + (w * 7));

                let currentDayOfWeek = startOfWeekW.getDay();
                let dayDiff = schDay - currentDayOfWeek;

                let classDate = new Date(startOfWeekW);
                classDate.setDate(startOfWeekW.getDate() + dayDiff);

                let [hours, minutes] = sch.time.split(':');
                classDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                const roomId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

                sessionsToInsert.push({
                    teacher_id: teacherId,
                    course_id: course.id,
                    title: `${course.title} - Buổi ${sessionCount}`,
                    description: `Buổi học số ${sessionCount} của khóa học ${course.title}`,
                    scheduled_at: classDate.toISOString(),
                    duration_minutes: 60,
                    room_id: roomId,
                    max_participants: course.max_students,
                    status: 'scheduled'
                });

                sessionCount++;
            }
        }

        if (sessionsToInsert.length > 0) {
            const { error: sessionError } = await supabaseAdmin
                .from('live_sessions')
                .insert(sessionsToInsert);

            if (sessionError) throw sessionError;
        }

        const { error: updateError } = await supabaseAdmin
            .from('courses')
            .update({ status: 'published', updated_at: new Date().toISOString() })
            .eq('id', courseId);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Publish khóa học thành công, đã tự động sinh các buổi học', generated_sessions: sessionsToInsert.length });
    } catch (e) {
        console.error('Publish error', e);
        res.status(500).json({ success: false, message: 'Lỗi publish khóa học', error: e.message });
    }
};

CourseController.getMyTeachingCourses = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('courses')
            .select('*')
            .eq('teacher_id', teacherId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) query = query.lt('created_at', cursor);

        const { data: courses, error } = await query;
        if (error) throw error;

        res.json({ success: true, ...buildPaginatedResponse(courses, limit) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách khóa học của giáo viên', error: e.message });
    }
};

CourseController.getCourseEnrollments = async (req, res) => {
    try {
        const courseId = req.params.id;
        const teacherId = req.user.id;

        const { data: course } = await supabaseAdmin.from('courses').select('id, teacher_id').eq('id', courseId).single();
        if (!course || course.teacher_id !== teacherId) return res.status(403).json({ success: false, message: 'Không có quyền' });

        const { data: enrollments, error } = await supabaseAdmin
            .from('course_enrollments')
            .select('*')
            .eq('course_id', courseId)
            .eq('status', 'active');

        if (error) throw error;

        const userIds = enrollments.map(e => e.user_id);
        const profileMap = await fetchProfiles(userIds);

        const enriched = enrollments.map(e => ({
            ...e,
            user: profileMap[e.user_id] || { id: e.user_id }
        }));

        res.json({ success: true, data: enriched });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ==========================================
// LEARNER ENDPOINTS
// ==========================================

CourseController.getMyEnrolledCourses = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: enrollments, error } = await supabaseAdmin
            .from('course_enrollments')
            .select('*, course:courses(*)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Enrich teacher
        const teacherIds = [...new Set(enrollments.map(e => e.course?.teacher_id).filter(Boolean))];
        const profileMap = await fetchProfiles(teacherIds);

        const data = enrollments.map(e => ({
            ...e.course,
            enrollment_id: e.id,
            enrollment_date: e.created_at,
            teacher: profileMap[e.course.teacher_id] || { id: e.course.teacher_id }
        }));

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

CourseController.getPublicCourses = async (req, res) => {
    try {
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('courses')
            .select('*')
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) query = query.lt('created_at', cursor);

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
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

CourseController.getCourseDetails = async (req, res) => {
    try {
        const courseId = req.params.id;
        const { data: course, error } = await supabaseAdmin
            .from('courses')
            .select('*')
            .eq('id', courseId)
            .single();

        if (error || !course) return res.status(404).json({ success: false, message: 'Không tìm thấy' });

        const profileMap = await fetchProfiles([course.teacher_id]);
        course.teacher = profileMap[course.teacher_id] || { id: course.teacher_id };

        // count enrollments
        const { count } = await supabaseAdmin.from('course_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', courseId)
            .eq('status', 'active');

        course.enrolled_count = count || 0;

        res.json({ success: true, data: course });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

CourseController.getTeacherCourses = async (req, res) => {
    try {
        const teacherId = req.params.teacherId;
        const { data: courses, error } = await supabaseAdmin
            .from('courses')
            .select('*')
            .eq('teacher_id', teacherId)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: courses });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

CourseController.getAdminStats = async (req, res) => {
    try {
        const { count: totalCourses } = await supabaseAdmin
            .from('courses')
            .select('id', { count: 'exact', head: true });

        const { count: totalEnrollments } = await supabaseAdmin
            .from('course_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active');

        res.json({
            success: true,
            data: {
                totalCourses: totalCourses || 0,
                totalEnrollments: totalEnrollments || 0
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lấy thống kê khóa học admin', error: e.message });
    }
};

module.exports = CourseController;
