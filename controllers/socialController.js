const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const SocialController = {};

// ============================================================================
// HELPER: Batch-fetch profiles (same pattern as postController)
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
// FOLLOW / UNFOLLOW
// ============================================================================

/**
 * POST /api/users/:id/follow - Follow a user
 */
SocialController.followUser = async (req, res) => {
    try {
        const followingId = req.params.id;
        const followerId = req.user.id;

        if (followerId === followingId) {
            return res.status(400).json({ success: false, message: 'Không thể follow chính mình' });
        }

        // Verify target user exists
        const { data: targetUser } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', followingId)
            .single();

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        const { error } = await supabaseAdmin
            .from('follows')
            .insert({ follower_id: followerId, following_id: followingId });

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ success: false, message: 'Đã follow người này rồi' });
            }
            throw error;
        }

        res.json({ success: true, message: 'Follow thành công', data: { is_following: true } });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ success: false, message: 'Lỗi follow', error: error.message });
    }
};

/**
 * DELETE /api/users/:id/follow - Unfollow a user
 */
SocialController.unfollowUser = async (req, res) => {
    try {
        const followingId = req.params.id;
        const followerId = req.user.id;

        const { error } = await supabaseAdmin
            .from('follows')
            .delete()
            .eq('follower_id', followerId)
            .eq('following_id', followingId);

        if (error) throw error;

        res.json({ success: true, message: 'Unfollow thành công', data: { is_following: false } });
    } catch (error) {
        console.error('Unfollow error:', error);
        res.status(500).json({ success: false, message: 'Lỗi unfollow', error: error.message });
    }
};

/**
 * GET /api/users/:id/followers - Get followers list
 */
SocialController.getFollowers = async (req, res) => {
    try {
        const userId = req.params.id;
        const currentUserId = req.user?.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('follows')
            .select('id, created_at, follower_id')
            .eq('following_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: follows, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(follows, limit);

        // Batch-fetch profiles for all follower_ids
        const followerIds = response.data.map(f => f.follower_id);
        const profileMap = await fetchProfiles(followerIds);

        // Check if current user follows each follower
        let followingSet = new Set();
        if (currentUserId && followerIds.length > 0) {
            const { data: myFollows } = await supabaseAdmin
                .from('follows')
                .select('following_id')
                .eq('follower_id', currentUserId)
                .in('following_id', followerIds);
            followingSet = new Set((myFollows || []).map(f => f.following_id));
        }

        response.data = response.data.map(f => ({
            ...(profileMap[f.follower_id] || { id: f.follower_id }),
            followed_at: f.created_at,
            is_following: followingSet.has(f.follower_id)
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get followers error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách followers', error: error.message });
    }
};

/**
 * GET /api/users/:id/following - Get following list
 */
SocialController.getFollowing = async (req, res) => {
    try {
        const userId = req.params.id;
        const currentUserId = req.user?.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('follows')
            .select('id, created_at, following_id')
            .eq('follower_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: follows, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(follows, limit);

        const followingIds = response.data.map(f => f.following_id);
        const profileMap = await fetchProfiles(followingIds);

        let followingSet = new Set();
        if (currentUserId && followingIds.length > 0) {
            const { data: myFollows } = await supabaseAdmin
                .from('follows')
                .select('following_id')
                .eq('follower_id', currentUserId)
                .in('following_id', followingIds);
            followingSet = new Set((myFollows || []).map(f => f.following_id));
        }

        response.data = response.data.map(f => ({
            ...(profileMap[f.following_id] || { id: f.following_id }),
            followed_at: f.created_at,
            is_following: currentUserId === userId ? true : followingSet.has(f.following_id)
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get following error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách following', error: error.message });
    }
};

// ============================================================================
// TEACHER PUBLIC PROFILE
// ============================================================================

/**
 * GET /api/teachers/:id/public - Get teacher public profile
 */
SocialController.getTeacherPublicProfile = async (req, res) => {
    try {
        const teacherId = req.params.id;
        const currentUserId = req.user?.id;

        // Get teacher profile
        const { data: teacher, error: tError } = await supabaseAdmin
            .from('teacher_profiles')
            .select('*')
            .eq('user_id', teacherId)
            .eq('verification_status', 'approved')
            .single();

        if (tError || !teacher) {
            return res.status(404).json({ success: false, message: 'Hồ sơ giáo viên không tồn tại hoặc chưa được duyệt' });
        }

        // Get basic profile info
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, avatar_url, role, followers_count, following_count')
            .eq('id', teacherId)
            .single();

        // Get courses count
        const { count: coursesCount } = await supabaseAdmin
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .eq('status', 'active');

        // Get total students
        const { data: courses } = await supabaseAdmin
            .from('courses')
            .select('current_students')
            .eq('teacher_id', teacherId);
        const totalStudents = (courses || []).reduce((sum, c) => sum + (c.current_students || 0), 0);

        // Check if current user follows this teacher
        let isFollowing = false;
        if (currentUserId) {
            const { data: follow } = await supabaseAdmin
                .from('follows')
                .select('id')
                .eq('follower_id', currentUserId)
                .eq('following_id', teacherId)
                .single();
            isFollowing = !!follow;
        }

        res.json({
            success: true,
            data: {
                ...teacher,
                profile: profile || {},
                stats: {
                    courses_count: coursesCount || 0,
                    total_students: totalStudents,
                    followers_count: profile?.followers_count || 0
                },
                is_following: isFollowing
            }
        });
    } catch (error) {
        console.error('Get teacher public profile error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy hồ sơ giáo viên', error: error.message });
    }
};

/**
 * GET /api/teachers/:id/courses - Get teacher's public courses
 */
SocialController.getTeacherCourses = async (req, res) => {
    try {
        const teacherId = req.params.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('courses')
            .select('*')
            .eq('teacher_id', teacherId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: courses, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(courses, limit);
        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get teacher courses error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy khóa học', error: error.message });
    }
};

/**
 * GET /api/teachers/:id/reviews - Get reviews/posts about teacher's courses
 */
SocialController.getTeacherReviews = async (req, res) => {
    try {
        const teacherId = req.params.id;
        const { cursor, limit } = parsePagination(req.query);

        // Get teacher's course IDs
        const { data: courses } = await supabaseAdmin
            .from('courses')
            .select('id')
            .eq('teacher_id', teacherId);

        const courseIds = (courses || []).map(c => c.id);

        if (courseIds.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { has_more: false, next_cursor: null, count: 0 }
            });
        }

        let query = supabaseAdmin
            .from('posts')
            .select('*')
            .eq('post_type', 'course_review')
            .in('related_course_id', courseIds)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: reviews, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(reviews, limit);

        // Enrich reviews with author profiles
        if (response.data.length > 0) {
            const userIds = [...new Set(response.data.map(r => r.user_id))];
            const profileMap = await fetchProfiles(userIds);
            response.data = response.data.map(r => ({
                ...r,
                author: profileMap[r.user_id] || { id: r.user_id }
            }));
        }

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get teacher reviews error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy đánh giá', error: error.message });
    }
};

// ============================================================================
// TEACHERS LIST (Suggested teachers for sidebar)
// ============================================================================

/**
 * GET /api/social/teachers - Get list of teachers for suggestions
 */
SocialController.getTeachersList = async (req, res) => {
    try {
        const { data: teachers, error } = await supabaseAdmin
            .from('users')
            .select('id, full_name, avatar_url, role')
            .eq('role', 'teacher')
            .limit(10);

        if (error) throw error;

        res.json({ success: true, data: teachers || [] });
    } catch (error) {
        console.error('Get teachers list error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách giáo viên', error: error.message });
    }
};

// ============================================================================
// USER SEARCH (for new conversation)
// ============================================================================

/**
 * GET /api/social/users/search?q=keyword - Search users by name
 */
SocialController.searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || String(q).trim().length < 2) {
            return res.json({ success: true, data: [] });
        }

        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('id, full_name, avatar_url, role')
            .ilike('full_name', `%${String(q).trim()}%`)
            .limit(20);

        if (error) throw error;

        res.json({ success: true, data: users || [] });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ success: false, message: 'Lỗi tìm kiếm người dùng', error: error.message });
    }
};

module.exports = SocialController;
