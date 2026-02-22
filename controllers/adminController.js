const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const AdminController = {};

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
// PLATFORM OVERVIEW
// ============================================================================

/**
 * GET /api/admin/dashboard — Platform overview stats
 */
AdminController.getDashboard = async (req, res) => {
    try {
        const [
            { count: totalUsers },
            { count: totalPosts },
            { count: totalSessions },
            { count: totalConversations },
            { count: pendingReports },
            { count: activeSessions }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('conversations').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('status', 'live')
        ]);

        // Today's stats
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        const [
            { count: newUsersToday },
            { count: newPostsToday },
            { count: sessionsToday }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
            supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
            supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).gte('created_at', todayStart)
        ]);

        res.json({
            success: true,
            data: {
                overview: {
                    total_users: totalUsers || 0,
                    total_posts: totalPosts || 0,
                    total_sessions: totalSessions || 0,
                    total_conversations: totalConversations || 0,
                    active_sessions: activeSessions || 0,
                    pending_reports: pendingReports || 0
                },
                today: {
                    new_users: newUsersToday || 0,
                    new_posts: newPostsToday || 0,
                    sessions_created: sessionsToday || 0
                }
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy dashboard', error: error.message });
    }
};

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/users — List all users with stats
 */
AdminController.getUsers = async (req, res) => {
    try {
        const { role, search } = req.query;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (role) query = query.eq('role', role);
        if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        if (cursor) query = query.lt('created_at', cursor);

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, ...buildPaginatedResponse(data, limit) });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách users', error: error.message });
    }
};

/**
 * GET /api/admin/users/:id — User detail
 */
AdminController.getUserDetail = async (req, res) => {
    try {
        const userId = req.params.id;

        const [
            { data: profile },
            { count: postsCount },
            { count: sessionsCount },
            { data: learningStats }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
            supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
            supabaseAdmin.from('session_participants').select('id', { count: 'exact', head: true }).eq('user_id', userId),
            supabaseAdmin.from('user_learning_stats').select('*').eq('user_id', userId).single()
        ]);

        if (!profile) {
            return res.status(404).json({ success: false, message: 'User không tồn tại' });
        }

        res.json({
            success: true,
            data: {
                profile,
                stats: {
                    posts_count: postsCount || 0,
                    sessions_count: sessionsCount || 0,
                    learning: learningStats || null
                }
            }
        });
    } catch (error) {
        console.error('Get user detail error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy thông tin user', error: error.message });
    }
};

// ============================================================================
// CONTENT MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/posts — List posts (admin)
 */
AdminController.getPosts = async (req, res) => {
    try {
        const { user_id, post_type } = req.query;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (user_id) query = query.eq('user_id', user_id);
        if (post_type) query = query.eq('post_type', post_type);
        if (cursor) query = query.lt('created_at', cursor);

        const { data, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(data, limit);

        const userIds = [...new Set(response.data.map(p => p.user_id))];
        const profileMap = await fetchProfiles(userIds);
        response.data = response.data.map(p => ({
            ...p,
            author: profileMap[p.user_id] || { id: p.user_id }
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Admin get posts error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy bài viết', error: error.message });
    }
};

/**
 * DELETE /api/admin/posts/:id — Force delete a post
 */
AdminController.deletePost = async (req, res) => {
    try {
        const postId = req.params.id;

        const { error } = await supabaseAdmin.from('posts').delete().eq('id', postId);
        if (error) throw error;

        res.json({ success: true, message: 'Đã xóa bài viết' });
    } catch (error) {
        console.error('Admin delete post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa bài viết', error: error.message });
    }
};

/**
 * DELETE /api/admin/comments/:id — Force delete a comment
 */
AdminController.deleteComment = async (req, res) => {
    try {
        const commentId = req.params.id;

        const { error } = await supabaseAdmin.from('post_comments').delete().eq('id', commentId);
        if (error) throw error;

        res.json({ success: true, message: 'Đã xóa bình luận' });
    } catch (error) {
        console.error('Admin delete comment error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa bình luận', error: error.message });
    }
};

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/sessions — List all sessions
 */
AdminController.getSessions = async (req, res) => {
    try {
        const { status, teacher_id } = req.query;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('live_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (status) query = query.eq('status', status);
        if (teacher_id) query = query.eq('teacher_id', teacher_id);
        if (cursor) query = query.lt('created_at', cursor);

        const { data, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(data, limit);

        const teacherIds = [...new Set(response.data.map(s => s.teacher_id))];
        const profileMap = await fetchProfiles(teacherIds);
        response.data = response.data.map(s => ({
            ...s,
            teacher: profileMap[s.teacher_id] || { id: s.teacher_id }
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Admin get sessions error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy buổi học', error: error.message });
    }
};

/**
 * DELETE /api/admin/sessions/:id — Force cancel a session
 */
AdminController.forceEndSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const livekit = require('../utils/livekit');

        const { data: session } = await supabaseAdmin
            .from('live_sessions')
            .select('room_id, status')
            .eq('id', sessionId)
            .single();

        if (session?.status === 'live' && session.room_id) {
            await livekit.deleteRoom(session.room_id);
        }

        await supabaseAdmin
            .from('live_sessions')
            .update({ status: 'cancelled' })
            .eq('id', sessionId);

        await supabaseAdmin
            .from('session_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('session_id', sessionId)
            .is('left_at', null);

        res.json({ success: true, message: 'Đã hủy buổi học' });
    } catch (error) {
        console.error('Admin force end session error:', error);
        res.status(500).json({ success: false, message: 'Lỗi hủy buổi học', error: error.message });
    }
};

module.exports = AdminController;
