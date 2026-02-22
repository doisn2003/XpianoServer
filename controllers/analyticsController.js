const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const AnalyticsController = {};

// ============================================================================
// HELPER
// ============================================================================
async function fetchProfiles(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const { data } = await supabaseAdmin.from('profiles').select('id, full_name, avatar_url, role').in('id', userIds);
    const map = {};
    (data || []).forEach(p => { map[p.id] = p; });
    return map;
}

// ============================================================================
// SESSION ANALYTICS
// ============================================================================

/**
 * POST /api/analytics/sessions/:sessionId/join — Record user joining a session
 */
AnalyticsController.recordJoin = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { device_info } = req.body;

        const { data, error } = await supabaseAdmin
            .from('session_analytics')
            .insert({
                session_id: sessionId,
                user_id: userId,
                join_time: new Date().toISOString(),
                device_info: device_info || {}
            })
            .select('*')
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, data });
    } catch (error) {
        console.error('Record join error:', error);
        res.status(500).json({ success: false, message: 'Lỗi ghi nhận tham gia', error: error.message });
    }
};

/**
 * PUT /api/analytics/sessions/:sessionId/leave — Record user leaving
 */
AnalyticsController.recordLeave = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { engagement_score, chat_messages_count, connection_quality } = req.body;

        // Find the latest entry without leave_time
        const { data: entry } = await supabaseAdmin
            .from('session_analytics')
            .select('*')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .is('leave_time', null)
            .order('join_time', { ascending: false })
            .limit(1)
            .single();

        if (!entry) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi tham gia' });
        }

        const leaveTime = new Date();
        const joinTime = new Date(entry.join_time);
        const durationSeconds = Math.floor((leaveTime - joinTime) / 1000);

        const updates = {
            leave_time: leaveTime.toISOString(),
            duration_seconds: durationSeconds
        };
        if (engagement_score !== undefined) updates.engagement_score = engagement_score;
        if (chat_messages_count !== undefined) updates.chat_messages_count = chat_messages_count;
        if (connection_quality) updates.connection_quality = connection_quality;

        const { data, error } = await supabaseAdmin
            .from('session_analytics')
            .update(updates)
            .eq('id', entry.id)
            .select('*')
            .single();

        if (error) throw error;

        // Update user learning stats
        await updateUserLearningStats(userId);

        res.json({ success: true, data });
    } catch (error) {
        console.error('Record leave error:', error);
        res.status(500).json({ success: false, message: 'Lỗi ghi nhận rời phòng', error: error.message });
    }
};

/**
 * Update aggregated learning stats for a user.
 */
async function updateUserLearningStats(userId) {
    try {
        const { data: analytics } = await supabaseAdmin
            .from('session_analytics')
            .select('duration_seconds, engagement_score, chat_messages_count, join_time')
            .eq('user_id', userId)
            .not('leave_time', 'is', null);

        if (!analytics || analytics.length === 0) return;

        const totalMinutes = Math.floor(analytics.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) / 60);
        const totalChat = analytics.reduce((sum, a) => sum + (a.chat_messages_count || 0), 0);
        const avgEngagement = analytics.reduce((sum, a) => sum + (a.engagement_score || 0), 0) / analytics.length;

        // Calculate streak
        const dates = [...new Set(analytics.map(a => new Date(a.join_time).toDateString()))].sort();
        let streak = 1, longestStreak = 1;
        for (let i = 1; i < dates.length; i++) {
            const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / (1000 * 60 * 60 * 24);
            if (diff <= 1) { streak++; longestStreak = Math.max(longestStreak, streak); }
            else { streak = 1; }
        }

        const lastSession = analytics.sort((a, b) => new Date(b.join_time) - new Date(a.join_time))[0];

        await supabaseAdmin
            .from('user_learning_stats')
            .upsert({
                user_id: userId,
                total_sessions_attended: analytics.length,
                total_learning_minutes: totalMinutes,
                total_chat_messages: totalChat,
                avg_engagement_score: Math.round(avgEngagement * 100) / 100,
                last_session_at: lastSession?.join_time,
                streak_days: streak,
                longest_streak: longestStreak
            }, { onConflict: 'user_id' });
    } catch (err) {
        console.error('Update learning stats error:', err);
    }
}

/**
 * GET /api/analytics/sessions/:sessionId — Session analytics summary
 */
AnalyticsController.getSessionAnalytics = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data: records, error } = await supabaseAdmin
            .from('session_analytics')
            .select('*')
            .eq('session_id', sessionId)
            .order('join_time', { ascending: true });

        if (error) throw error;

        const userIds = [...new Set(records.map(r => r.user_id))];
        const profileMap = await fetchProfiles(userIds);

        const totalDuration = records.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
        const avgEngagement = records.length > 0
            ? records.reduce((sum, r) => sum + (r.engagement_score || 0), 0) / records.length
            : 0;

        res.json({
            success: true,
            data: {
                session_id: sessionId,
                total_participants: userIds.length,
                total_duration_minutes: Math.floor(totalDuration / 60),
                avg_engagement_score: Math.round(avgEngagement * 100) / 100,
                participants: records.map(r => ({
                    ...r,
                    user: profileMap[r.user_id] || { id: r.user_id }
                }))
            }
        });
    } catch (error) {
        console.error('Get session analytics error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy analytics', error: error.message });
    }
};

/**
 * GET /api/analytics/users/me — Current user's learning stats
 */
AnalyticsController.getMyStats = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabaseAdmin
            .from('user_learning_stats')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json({
            success: true,
            data: data || {
                total_sessions_attended: 0,
                total_learning_minutes: 0,
                total_chat_messages: 0,
                avg_engagement_score: 0,
                streak_days: 0,
                longest_streak: 0
            }
        });
    } catch (error) {
        console.error('Get my stats error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy thống kê', error: error.message });
    }
};

/**
 * GET /api/analytics/users/:userId — User learning stats (admin/teacher)
 */
AnalyticsController.getUserStats = async (req, res) => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('user_learning_stats')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        const profileMap = await fetchProfiles([userId]);

        res.json({
            success: true,
            data: {
                user: profileMap[userId] || { id: userId },
                stats: data || { total_sessions_attended: 0, total_learning_minutes: 0 }
            }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy thống kê', error: error.message });
    }
};

// ============================================================================
// SESSION RECORDINGS
// ============================================================================

/**
 * POST /api/analytics/sessions/:sessionId/recordings — Save recording info
 */
AnalyticsController.saveRecording = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { storage_path, file_size, duration_seconds } = req.body;

        if (!storage_path) {
            return res.status(400).json({ success: false, message: 'storage_path là bắt buộc' });
        }

        // Verify teacher owns session
        const { data: session } = await supabaseAdmin
            .from('live_sessions')
            .select('teacher_id')
            .eq('id', sessionId)
            .single();

        if (!session || session.teacher_id !== userId) {
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        }

        const { data, error } = await supabaseAdmin
            .from('session_recordings')
            .insert({
                session_id: sessionId,
                recorded_by: userId,
                storage_path,
                file_size: file_size || 0,
                duration_seconds: duration_seconds || 0,
                status: 'ready'
            })
            .select('*')
            .single();

        if (error) throw error;

        // Also update the session's recording_url
        await supabaseAdmin
            .from('live_sessions')
            .update({ recording_url: storage_path })
            .eq('id', sessionId);

        res.status(201).json({ success: true, data });
    } catch (error) {
        console.error('Save recording error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lưu bản ghi', error: error.message });
    }
};

/**
 * GET /api/analytics/sessions/:sessionId/recordings — List recordings
 */
AnalyticsController.getRecordings = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('session_recordings')
            .select('*')
            .eq('session_id', sessionId)
            .eq('status', 'ready')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Get recordings error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy bản ghi', error: error.message });
    }
};

module.exports = AnalyticsController;
