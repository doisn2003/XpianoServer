const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');
const livekit = require('../utils/livekit');
const { getIO, emitNotification } = require('../socket/socketServer');

const SessionController = {};

// ============================================================================
// HELPER
// ============================================================================
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

// ============================================================================
// SESSION CRUD
// ============================================================================

/**
 * POST /api/sessions - Teacher creates a live session
 */
SessionController.createSession = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const {
            title, description, course_id,
            scheduled_at, duration_minutes,
            max_participants, settings
        } = req.body;

        if (!title || !scheduled_at) {
            return res.status(400).json({ success: false, message: 'title và scheduled_at là bắt buộc' });
        }

        // Generate a unique room ID for LiveKit
        const roomId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const { data, error } = await supabaseAdmin
            .from('live_sessions')
            .insert({
                teacher_id: teacherId,
                course_id: course_id || null,
                title: title.trim(),
                description: description?.trim() || null,
                scheduled_at,
                duration_minutes: duration_minutes || 60,
                room_id: roomId,
                max_participants: max_participants || 50,
                settings: settings || {}
            })
            .select('*')
            .single();

        if (error) throw error;

        // Enrich with teacher profile
        const profileMap = await fetchProfiles([teacherId]);

        res.status(201).json({
            success: true,
            message: 'Tạo buổi học thành công',
            data: { ...data, teacher: profileMap[teacherId] || { id: teacherId } }
        });
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi tạo buổi học', error: error.message });
    }
};

/**
 * GET /api/sessions - List sessions
 * Query: ?course_id=UUID&status=scheduled&teacher_id=UUID&cursor=ISO&limit=20
 */
SessionController.getSessions = async (req, res) => {
    try {
        const { course_id, status, teacher_id } = req.query;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('live_sessions')
            .select('*')
            .order('scheduled_at', { ascending: true })
            .limit(limit + 1);

        if (course_id) query = query.eq('course_id', course_id);
        if (status) query = query.eq('status', status);
        if (teacher_id) query = query.eq('teacher_id', teacher_id);
        if (cursor) query = query.gt('scheduled_at', cursor);

        const { data: sessions, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(sessions, limit);

        // Enrich with teacher profiles
        const teacherIds = [...new Set(response.data.map(s => s.teacher_id))];
        const profileMap = await fetchProfiles(teacherIds);
        response.data = response.data.map(s => ({
            ...s,
            teacher: profileMap[s.teacher_id] || { id: s.teacher_id }
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách buổi học', error: error.message });
    }
};

/**
 * GET /api/sessions/:id - Get session detail
 */
SessionController.getSession = async (req, res) => {
    try {
        const sessionId = req.params.id;

        const { data: session, error } = await supabaseAdmin
            .from('live_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (error || !session) {
            return res.status(404).json({ success: false, message: 'Buổi học không tồn tại' });
        }

        // Get participants count
        const { count: participantsCount } = await supabaseAdmin
            .from('session_participants')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .is('left_at', null);

        const profileMap = await fetchProfiles([session.teacher_id]);

        res.json({
            success: true,
            data: {
                ...session,
                teacher: profileMap[session.teacher_id] || { id: session.teacher_id },
                current_participants: participantsCount || 0
            }
        });
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy chi tiết buổi học', error: error.message });
    }
};

/**
 * PUT /api/sessions/:id - Update session (teacher only)
 */
SessionController.updateSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const teacherId = req.user.id;
        const { title, description, scheduled_at, duration_minutes, max_participants, settings } = req.body;

        // Verify ownership
        const { data: existing } = await supabaseAdmin
            .from('live_sessions')
            .select('teacher_id, status')
            .eq('id', sessionId)
            .single();

        if (!existing || existing.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Không có quyền sửa buổi học này' });
        }

        if (existing.status === 'ended' || existing.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Không thể sửa buổi học đã kết thúc' });
        }

        const updates = {};
        if (title !== undefined) updates.title = title.trim();
        if (description !== undefined) updates.description = description?.trim() || null;
        if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
        if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
        if (max_participants !== undefined) updates.max_participants = max_participants;
        if (settings !== undefined) updates.settings = settings;

        const { data, error } = await supabaseAdmin
            .from('live_sessions')
            .update(updates)
            .eq('id', sessionId)
            .select('*')
            .single();

        if (error) throw error;

        res.json({ success: true, message: 'Cập nhật thành công', data });
    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi cập nhật buổi học', error: error.message });
    }
};

/**
 * DELETE /api/sessions/:id - Cancel a session
 */
SessionController.deleteSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const teacherId = req.user.id;

        const { data: existing } = await supabaseAdmin
            .from('live_sessions')
            .select('teacher_id, status, room_id')
            .eq('id', sessionId)
            .single();

        if (!existing || existing.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Không có quyền hủy buổi học này' });
        }

        // If live, close the LiveKit room
        if (existing.status === 'live' && existing.room_id) {
            await livekit.deleteRoom(existing.room_id);
        }

        const { error } = await supabaseAdmin
            .from('live_sessions')
            .update({ status: 'cancelled' })
            .eq('id', sessionId);

        if (error) throw error;

        res.json({ success: true, message: 'Đã hủy buổi học' });
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi hủy buổi học', error: error.message });
    }
};

// ============================================================================
// SESSION LIFECYCLE: START → JOIN → LEAVE → END
// ============================================================================

/**
 * POST /api/sessions/:id/start - Teacher starts the session (goes live)
 */
SessionController.startSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const teacherId = req.user.id;

        const { data: session } = await supabaseAdmin
            .from('live_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (!session || session.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        }

        if (session.status !== 'scheduled') {
            return res.status(400).json({ success: false, message: `Buổi học đang ở trạng thái: ${session.status}` });
        }

        // Update status to live
        const { data, error } = await supabaseAdmin
            .from('live_sessions')
            .update({ status: 'live', started_at: new Date().toISOString() })
            .eq('id', sessionId)
            .select('*')
            .single();

        if (error) throw error;

        // Generate LiveKit token for teacher (can publish multiple tracks)
        const profileMap = await fetchProfiles([teacherId]);
        const teacherName = profileMap[teacherId]?.full_name || 'Teacher';

        const token = await livekit.generateToken(
            session.room_id,
            teacherId,
            teacherName,
            {
                canPublish: true,
                canSubscribe: true,
                metadata: { role: 'teacher', session_id: sessionId }
            }
        );

        // Add teacher as participant
        await supabaseAdmin
            .from('session_participants')
            .upsert({
                session_id: sessionId,
                user_id: teacherId,
                role: 'teacher',
                joined_at: new Date().toISOString(),
                left_at: null
            }, { onConflict: 'session_id,user_id' });

        res.json({
            success: true,
            message: 'Buổi học đã bắt đầu!',
            data: {
                session: data,
                livekit: {
                    token,
                    url: livekit.LIVEKIT_URL,
                    room_id: session.room_id
                }
            }
        });
    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi bắt đầu buổi học', error: error.message });
    }
};

/**
 * POST /api/sessions/:id/join - Student joins a live session → get LiveKit token
 */
SessionController.joinSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const userId = req.user.id;

        const { data: session } = await supabaseAdmin
            .from('live_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (!session) {
            return res.status(404).json({ success: false, message: 'Buổi học không tồn tại' });
        }

        if (session.status !== 'live') {
            return res.status(400).json({
                success: false,
                message: session.status === 'scheduled'
                    ? 'Buổi học chưa bắt đầu'
                    : 'Buổi học đã kết thúc'
            });
        }

        // Check participant count
        const { count } = await supabaseAdmin
            .from('session_participants')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .is('left_at', null);

        if (count >= session.max_participants) {
            return res.status(400).json({ success: false, message: 'Buổi học đã đầy' });
        }

        // Generate LiveKit token for student
        const profileMap = await fetchProfiles([userId]);
        const userName = profileMap[userId]?.full_name || 'Student';
        const isTeacher = session.teacher_id === userId;

        const token = await livekit.generateToken(
            session.room_id,
            userId,
            userName,
            {
                canPublish: isTeacher,   // students can't publish by default
                canSubscribe: true,
                metadata: { role: isTeacher ? 'teacher' : 'student', session_id: sessionId }
            }
        );

        // Upsert participant record
        await supabaseAdmin
            .from('session_participants')
            .upsert({
                session_id: sessionId,
                user_id: userId,
                role: isTeacher ? 'teacher' : 'student',
                joined_at: new Date().toISOString(),
                left_at: null
            }, { onConflict: 'session_id,user_id' });

        // Notify via Socket.io
        const io = getIO();
        if (io) {
            io.to(`session:${sessionId}`).emit('participant_joined', {
                session_id: sessionId,
                user: profileMap[userId] || { id: userId }
            });
        }

        res.json({
            success: true,
            message: 'Tham gia buổi học thành công',
            data: {
                session,
                livekit: {
                    token,
                    url: livekit.LIVEKIT_URL,
                    room_id: session.room_id
                }
            }
        });
    } catch (error) {
        console.error('Join session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi tham gia buổi học', error: error.message });
    }
};

/**
 * POST /api/sessions/:id/leave - Leave a session
 */
SessionController.leaveSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const userId = req.user.id;

        await supabaseAdmin
            .from('session_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('session_id', sessionId)
            .eq('user_id', userId);

        const io = getIO();
        if (io) {
            io.to(`session:${sessionId}`).emit('participant_left', {
                session_id: sessionId,
                user_id: userId
            });
        }

        res.json({ success: true, message: 'Đã rời buổi học' });
    } catch (error) {
        console.error('Leave session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi rời buổi học', error: error.message });
    }
};

/**
 * POST /api/sessions/:id/end - Teacher ends the session
 */
SessionController.endSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const teacherId = req.user.id;

        const { data: session } = await supabaseAdmin
            .from('live_sessions')
            .select('teacher_id, status, room_id')
            .eq('id', sessionId)
            .single();

        if (!session || session.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        }

        if (session.status !== 'live') {
            return res.status(400).json({ success: false, message: 'Buổi học không đang diễn ra' });
        }

        // Close LiveKit room
        if (session.room_id) {
            await livekit.deleteRoom(session.room_id);
        }

        // Update session
        const { data, error } = await supabaseAdmin
            .from('live_sessions')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', sessionId)
            .select('*')
            .single();

        if (error) throw error;

        // Mark all participants as left
        await supabaseAdmin
            .from('session_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('session_id', sessionId)
            .is('left_at', null);

        // Notify via Socket.io
        const io = getIO();
        if (io) {
            io.to(`session:${sessionId}`).emit('session_ended', { session_id: sessionId });
        }

        res.json({ success: true, message: 'Buổi học đã kết thúc', data });
    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi kết thúc buổi học', error: error.message });
    }
};

// ============================================================================
// SESSION PARTICIPANTS
// ============================================================================

/**
 * GET /api/sessions/:id/participants - List session participants
 */
SessionController.getParticipants = async (req, res) => {
    try {
        const sessionId = req.params.id;

        const { data: participants, error } = await supabaseAdmin
            .from('session_participants')
            .select('*')
            .eq('session_id', sessionId)
            .is('left_at', null)
            .order('joined_at', { ascending: true });

        if (error) throw error;

        const userIds = participants.map(p => p.user_id);
        const profileMap = await fetchProfiles(userIds);

        const enriched = participants.map(p => ({
            ...p,
            user: profileMap[p.user_id] || { id: p.user_id }
        }));

        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('Get participants error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách', error: error.message });
    }
};

// ============================================================================
// IN-SESSION CHAT (REST endpoints — Socket.io is primary)
// ============================================================================

/**
 * GET /api/sessions/:id/chat - Get chat history
 */
SessionController.getChatHistory = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('session_chat')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .limit(limit + 1);

        if (cursor) {
            query = query.gt('created_at', cursor);
        }

        const { data: messages, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(messages, limit);

        const userIds = [...new Set(response.data.map(m => m.user_id))];
        const profileMap = await fetchProfiles(userIds);
        response.data = response.data.map(m => ({
            ...m,
            author: profileMap[m.user_id] || { id: m.user_id }
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get chat error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy chat', error: error.message });
    }
};

/**
 * POST /api/sessions/:id/chat - Send a chat message (REST fallback)
 */
SessionController.sendChatMessage = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const userId = req.user.id;
        const { message, message_type } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'Nội dung là bắt buộc' });
        }

        // Verify session is live
        const { data: session } = await supabaseAdmin
            .from('live_sessions')
            .select('status')
            .eq('id', sessionId)
            .single();

        if (!session || session.status !== 'live') {
            return res.status(400).json({ success: false, message: 'Buổi học không đang diễn ra' });
        }

        const { data, error } = await supabaseAdmin
            .from('session_chat')
            .insert({
                session_id: sessionId,
                user_id: userId,
                message: message.trim(),
                message_type: message_type || 'text'
            })
            .select('*')
            .single();

        if (error) throw error;

        const profileMap = await fetchProfiles([userId]);
        const enriched = { ...data, author: profileMap[userId] || { id: userId } };

        // Broadcast via Socket.io
        const io = getIO();
        if (io) {
            io.to(`session:${sessionId}`).emit('session_chat', enriched);
        }

        res.status(201).json({ success: true, data: enriched });
    } catch (error) {
        console.error('Send chat error:', error);
        res.status(500).json({ success: false, message: 'Lỗi gửi chat', error: error.message });
    }
};

module.exports = SessionController;
