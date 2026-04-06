/**
 * scheduleController.js
 * Quản lý Lịch tuyển sinh (CourseSchedule).
 * Lịch là slot để học viên đăng ký vào 1 khóa học cụ thể.
 * Khi đóng gói (POST /convert) → sinh ra CourseClass thực sự.
 */
const { supabaseAdmin } = require('../utils/supabaseClient');

const ScheduleController = {};

function validateTeacher(req, res) {
    if (!req.user || !['teacher', 'admin'].includes(req.user.role)) {
        res.status(403).json({ success: false, message: 'Chỉ giáo viên mới có thể thực hiện thao tác này' });
        return false;
    }
    return true;
}

// ─────────────────────────────────────────────
// TEACHER — CRUD SCHEDULES
// ─────────────────────────────────────────────

/** POST /api/courses/:courseId/schedules — Tạo lịch tuyển sinh mới */
ScheduleController.createSchedule = async (req, res) => {
    try {
        if (!validateTeacher(req, res)) return;

        const { courseId } = req.params;
        const teacherId = req.user.id;
        const {
            name, start_date, duration_weeks, sessions_per_week,
            schedule, is_online, location,
            max_students, price, requires_payment
        } = req.body;

        // Kiểm tra quyền sở hữu course
        const { data: course } = await supabaseAdmin
            .from('courses')
            .select('id, teacher_id, title, status')
            .eq('id', courseId)
            .single();

        if (!course) return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
        if (course.teacher_id !== teacherId && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (course.status === 'archived')
            return res.status(400).json({ success: false, message: 'Khóa học đã lưu trữ, không thể tạo lịch mới' });
        if (course.status === 'draft')
            return res.status(400).json({ success: false, message: 'Cần kích hoạt khóa học (active) trước khi tạo lịch' });

        if (!start_date || !schedule || !Array.isArray(schedule) || schedule.length === 0)
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc: start_date, schedule' });

        if (!is_online && !location)
            return res.status(400).json({ success: false, message: 'Học offline cần cung cấp địa điểm (location)' });

        const { data, error } = await supabaseAdmin
            .from('course_schedules')
            .insert({
                course_id:        courseId,
                teacher_id:       teacherId,
                name:             name || `Lịch học - ${new Date(start_date).toLocaleDateString('vi-VN')}`,
                start_date,
                duration_weeks:   duration_weeks || course.duration_weeks || 8,
                sessions_per_week: sessions_per_week || 2,
                schedule,
                is_online:        is_online !== false,
                location:         is_online !== false ? null : location,
                max_students:     max_students || 10,
                price:            price !== undefined ? price : null,
                requires_payment: requires_payment !== false,
                status:           'enrolling'
            })
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Tạo lịch tuyển sinh thành công', data });
    } catch (e) {
        console.error('createSchedule error', e);
        res.status(500).json({ success: false, message: 'Lỗi tạo lịch học', error: e.message });
    }
};

/** GET /api/courses/:courseId/schedules — Lịch tuyển sinh của 1 khóa */
ScheduleController.getCourseSchedules = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { status } = req.query;

        let query = supabaseAdmin
            .from('course_schedules')
            .select('*')
            .eq('course_id', courseId)
            .order('start_date', { ascending: true });

        // Public chỉ thấy enrolling; GV/admin thấy tất cả
        const isOwner = req.user && ['teacher', 'admin'].includes(req.user.role);
        if (!isOwner) query = query.eq('status', 'enrolling');
        else if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lấy lịch học', error: e.message });
    }
};

/** GET /api/schedules/:id — Chi tiết 1 lịch */
ScheduleController.getSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabaseAdmin
            .from('course_schedules')
            .select('*, course:courses(id, title, teacher_id, level, category, thumbnail_url)')
            .eq('id', id)
            .single();

        if (error || !data) return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** PUT /api/schedules/:id — Cập nhật lịch (chỉ khi enrolling và chưa có enrollment) */
ScheduleController.updateSchedule = async (req, res) => {
    try {
        if (!validateTeacher(req, res)) return;

        const { id } = req.params;
        const { data: schedule } = await supabaseAdmin
            .from('course_schedules')
            .select('teacher_id, status, enrolled_count')
            .eq('id', id)
            .single();

        if (!schedule) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (schedule.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (schedule.status !== 'enrolling')
            return res.status(400).json({ success: false, message: `Lịch học đang ở trạng thái "${schedule.status}", không thể chỉnh sửa` });

        const allowedFields = ['name', 'start_date', 'duration_weeks', 'sessions_per_week', 'schedule', 'is_online', 'location', 'max_students', 'price', 'requires_payment'];
        const updates = {};
        allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('course_schedules')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Cập nhật lịch học thành công', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật', error: e.message });
    }
};

/** DELETE /api/schedules/:id — Xóa lịch (chỉ có thể khi chưa có enrollment nào) */
ScheduleController.deleteSchedule = async (req, res) => {
    try {
        if (!validateTeacher(req, res)) return;

        const { id } = req.params;
        const { data: schedule } = await supabaseAdmin
            .from('course_schedules')
            .select('teacher_id, status, enrolled_count')
            .eq('id', id)
            .single();

        if (!schedule) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (schedule.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (schedule.enrolled_count > 0)
            return res.status(400).json({ success: false, message: `Không thể xóa: đã có ${schedule.enrolled_count} học viên đăng ký` });
        if (schedule.status === 'converted')
            return res.status(400).json({ success: false, message: 'Lịch đã được chuyển thành lớp học, không thể xóa' });

        const { error } = await supabaseAdmin.from('course_schedules').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Xóa lịch học thành công' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi xóa', error: e.message });
    }
};

/** POST /api/schedules/:id/close — Đóng tuyển sinh thủ công */
ScheduleController.closeSchedule = async (req, res) => {
    try {
        if (!validateTeacher(req, res)) return;

        const { id } = req.params;
        const { data: schedule } = await supabaseAdmin
            .from('course_schedules')
            .select('teacher_id, status')
            .eq('id', id)
            .single();

        if (!schedule) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        if (schedule.teacher_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (schedule.status !== 'enrolling')
            return res.status(400).json({ success: false, message: 'Chỉ có thể đóng lịch đang tuyển sinh' });

        const { data, error } = await supabaseAdmin
            .from('course_schedules')
            .update({ status: 'closed', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, name, status, enrolled_count')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Đã đóng tuyển sinh', data });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi', error: e.message });
    }
};

/** POST /api/schedules/:id/convert — Đóng gói → tạo CourseClass thực sự */
ScheduleController.convertToClass = async (req, res) => {
    try {
        if (!validateTeacher(req, res)) return;

        const { id } = req.params;
        const teacherId = req.user.id;
        const { class_name } = req.body;

        const { data: schedule } = await supabaseAdmin
            .from('course_schedules')
            .select('*, course:courses(id, title, teacher_id, duration_weeks)')
            .eq('id', id)
            .single();

        if (!schedule) return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
        if (schedule.teacher_id !== teacherId && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        if (schedule.status === 'converted')
            return res.status(400).json({ success: false, message: 'Lịch này đã được chuyển thành lớp học rồi' });
        if (schedule.status === 'enrolling') {
            // Auto-close trước khi convert
            await supabaseAdmin.from('course_schedules').update({ status: 'closed' }).eq('id', id);
        }

        // 1. Tính end_date
        const startDate = new Date(schedule.start_date);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + schedule.duration_weeks * 7);

        // 2. Tạo CourseClass
        const { data: newClass, error: classError } = await supabaseAdmin
            .from('course_classes')
            .insert({
                course_id:         schedule.course_id,
                schedule_id:       schedule.id,
                teacher_id:        schedule.teacher_id,
                name:              class_name || schedule.name,
                start_date:        schedule.start_date,
                end_date:          endDate.toISOString().split('T')[0],
                schedule_snapshot: {
                    schedule:          schedule.schedule,
                    duration_weeks:    schedule.duration_weeks,
                    sessions_per_week: schedule.sessions_per_week,
                    price:             schedule.price,
                    max_students:      schedule.max_students
                },
                is_online:  schedule.is_online,
                location:   schedule.location,
                status:     'upcoming'
            })
            .select('*')
            .single();

        if (classError) throw classError;

        // 3. Tạo Group Conversation cho lớp
        const { data: conversation } = await supabaseAdmin
            .from('conversations')
            .insert({
                type:       'group',
                name:       `Lớp: ${newClass.name}`,
                created_by: teacherId
            })
            .select('id')
            .single();

        if (conversation) {
            // Gán conversation vào class
            await supabaseAdmin
                .from('course_classes')
                .update({ conversation_id: conversation.id })
                .eq('id', newClass.id);

            // Thêm giáo viên vào conversation (role admin)
            await supabaseAdmin.from('conversation_members').insert({
                conversation_id: conversation.id,
                user_id: teacherId,
                role: 'admin'
            });

            // Thêm các học viên đã enrolled vào conversation
            const { data: enrollments } = await supabaseAdmin
                .from('course_enrollments')
                .select('user_id')
                .eq('course_id', schedule.course_id)
                .eq('status', 'active');

            if (enrollments && enrollments.length > 0) {
                const members = enrollments.map(e => ({
                    conversation_id: conversation.id,
                    user_id: e.user_id,
                    role: 'member'
                }));
                await supabaseAdmin.from('conversation_members').insert(members);
            }
        }

        // 4. Sinh live_sessions theo schedule
        const sessionsToInsert = [];
        const durationWeeks = schedule.duration_weeks;
        const scheduleArr = schedule.schedule || [];
        let sessionCount = 1;

        for (let w = 0; w < durationWeeks; w++) {
            for (const sch of scheduleArr) {
                const schDay = parseInt(sch.day_of_week);
                const weekStart = new Date(startDate);
                weekStart.setDate(startDate.getDate() + w * 7);
                const currentDay = weekStart.getDay();
                const dayDiff = schDay - currentDay;
                const classDate = new Date(weekStart);
                classDate.setDate(weekStart.getDate() + dayDiff);
                const [h, m] = sch.time.split(':');
                classDate.setHours(parseInt(h), parseInt(m), 0, 0);
                const roomId = `room_${newClass.id.substring(0, 8)}_${sessionCount}`;

                sessionsToInsert.push({
                    teacher_id:       schedule.teacher_id,
                    course_id:        schedule.course_id,
                    class_id:         newClass.id,
                    title:            `${schedule.course.title} - Buổi ${sessionCount}`,
                    description:      `Buổi học số ${sessionCount}`,
                    scheduled_at:     classDate.toISOString(),
                    duration_minutes: sch.duration_minutes || 60,
                    room_id:          roomId,
                    max_participants:  schedule.max_students,
                    status:           'scheduled'
                });
                sessionCount++;
            }
        }

        if (sessionsToInsert.length > 0) {
            const { error: sessionErr } = await supabaseAdmin.from('live_sessions').insert(sessionsToInsert);
            if (sessionErr) console.error('Sessions insert error', sessionErr);
        }

        // 5. Cập nhật enrollments của schedule sang class_id mới
        // Lấy enrollments đang active có course_id tương ứng và chưa có class_id
        const { data: scheduleEnrollments } = await supabaseAdmin
            .from('course_enrollments')
            .select('id')
            .eq('course_id', schedule.course_id)
            .eq('status', 'active')
            .is('class_id', null);

        if (scheduleEnrollments && scheduleEnrollments.length > 0) {
            const enrollmentIds = scheduleEnrollments.map(e => e.id);
            await supabaseAdmin
                .from('course_enrollments')
                .update({ class_id: newClass.id })
                .in('id', enrollmentIds);
        }

        // 6. Khởi tạo student_learning_progress cho từng học viên
        const { data: classEnrollments } = await supabaseAdmin
            .from('course_enrollments')
            .select('user_id')
            .eq('class_id', newClass.id)
            .eq('status', 'active');

        if (classEnrollments && classEnrollments.length > 0) {
            const progressRows = classEnrollments.map(e => ({
                class_id:       newClass.id,
                student_id:     e.user_id,
                sessions_total: sessionsToInsert.length,
                progress_status: 'on_track'
            }));
            await supabaseAdmin.from('student_learning_progress').upsert(progressRows, { onConflict: 'class_id,student_id' });
        }

        // 7. Đánh dấu schedule là converted
        await supabaseAdmin
            .from('course_schedules')
            .update({ status: 'converted', updated_at: new Date().toISOString() })
            .eq('id', id);

        res.status(201).json({
            success: true,
            message: `Đã tạo lớp học thành công với ${sessionsToInsert.length} buổi học`,
            data: {
                class: { ...newClass, conversation_id: conversation?.id },
                sessions_generated: sessionsToInsert.length,
                students_enrolled: classEnrollments?.length || 0
            }
        });
    } catch (e) {
        console.error('convertToClass error', e);
        res.status(500).json({ success: false, message: 'Lỗi chuyển đổi lịch thành lớp học', error: e.message });
    }
};

module.exports = ScheduleController;
