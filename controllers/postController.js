const { supabaseAdmin } = require('../utils/supabaseClient');
const pool = require('../config/database');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const PostController = {};

// ============================================================================
// HELPER: Batch-fetch profiles for an array of user_ids
// Supabase PostgREST can't resolve posts.user_id → auth.users ← profiles
// so we fetch profiles separately and merge.
// ============================================================================
async function enrichWithProfiles(items, userIdField = 'user_id') {
    if (!items || items.length === 0) return items;

    const userIds = [...new Set(items.map(i => i[userIdField]).filter(Boolean))];
    if (userIds.length === 0) return items;

    const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    return items.map(item => ({
        ...item,
        author: profileMap[item[userIdField]] || { id: item[userIdField], full_name: 'Unknown', avatar_url: null, role: 'user' }
    }));
}

// ============================================================================
// POSTS CRUD
// ============================================================================

/**
 * POST /api/posts - Create a new post
 */
PostController.createPost = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            content, media_urls, media_type, post_type, related_course_id, visibility,
            title, hashtags, location, thumbnail_url, duration, related_piano_id
        } = req.body;

        if (!content && (!media_urls || media_urls.length === 0)) {
            return res.status(400).json({ success: false, message: 'Nội dung hoặc media là bắt buộc' });
        }

        // Normalize hashtags: lowercase, trim, remove duplicates
        const normalizedHashtags = hashtags
            ? [...new Set(hashtags.map(h => h.toLowerCase().trim().replace(/^#/, '')).filter(Boolean))]
            : [];

        const { data, error } = await supabaseAdmin
            .from('posts')
            .insert({
                user_id: userId,
                content: content?.trim() || null,
                media_urls: media_urls || [],
                media_type: media_type || 'none',
                post_type: post_type || 'general',
                related_course_id: related_course_id || null,
                visibility: visibility || 'public',
                title: title?.trim() || null,
                hashtags: normalizedHashtags,
                location: location?.trim() || null,
                thumbnail_url: thumbnail_url || null,
                duration: duration || null,
                related_piano_id: related_piano_id || null
            })
            .select('*')
            .single();

        if (error) throw error;

        const [enriched] = await enrichWithProfiles([data]);

        res.status(201).json({
            success: true,
            message: 'Đăng bài thành công',
            data: { ...enriched, is_liked: false }
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi tạo bài viết', error: error.message });
    }
};

/**
 * GET /api/posts/feed - Get news feed (cursor-based pagination)
 * Query: ?cursor=ISO_TIMESTAMP&limit=20&type=general
 */
PostController.getFeed = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { cursor, limit } = parsePagination(req.query);
        const { type, media } = req.query;

        let query = supabaseAdmin
            .from('posts')
            .select('*')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        if (type && type !== 'all') {
            query = query.eq('post_type', type);
        }

        // Filter by media_type: video, image, none
        if (media && media !== 'all') {
            query = query.eq('media_type', media);
        }

        const { data: posts, error } = await query;
        if (error) throw error;

        // Check if current user liked each post
        let likedPostIds = new Set();
        if (userId && posts.length > 0) {
            const postIds = posts.slice(0, limit).map(p => p.id);
            const { data: likes } = await supabaseAdmin
                .from('post_likes')
                .select('post_id')
                .eq('user_id', userId)
                .in('post_id', postIds);
            likedPostIds = new Set((likes || []).map(l => l.post_id));
        }

        const response = buildPaginatedResponse(posts, limit);
        response.data = await enrichWithProfiles(response.data);
        response.data = response.data.map(post => ({
            ...post,
            is_liked: likedPostIds.has(post.id)
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get feed error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy feed', error: error.message });
    }
};

/**
 * GET /api/posts/user/:userId - Get posts by a specific user
 */
PostController.getUserPosts = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const currentUserId = req.user?.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('posts')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: posts, error } = await query;
        if (error) throw error;

        let likedPostIds = new Set();
        if (currentUserId && posts.length > 0) {
            const postIds = posts.slice(0, limit).map(p => p.id);
            const { data: likes } = await supabaseAdmin
                .from('post_likes')
                .select('post_id')
                .eq('user_id', currentUserId)
                .in('post_id', postIds);
            likedPostIds = new Set((likes || []).map(l => l.post_id));
        }

        const response = buildPaginatedResponse(posts, limit);
        response.data = await enrichWithProfiles(response.data);
        response.data = response.data.map(post => ({
            ...post,
            is_liked: likedPostIds.has(post.id)
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get user posts error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy bài viết', error: error.message });
    }
};

/**
 * GET /api/posts/:id - Get single post detail
 */
PostController.getPost = async (req, res) => {
    try {
        const postId = req.params.id;
        const currentUserId = req.user?.id;

        const { data: post, error } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (error || !post) {
            return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
        }

        const [enriched] = await enrichWithProfiles([post]);

        // Check if liked
        let isLiked = false;
        if (currentUserId) {
            const { data: like } = await supabaseAdmin
                .from('post_likes')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', currentUserId)
                .single();
            isLiked = !!like;
        }

        res.json({ success: true, data: { ...enriched, is_liked: isLiked } });
    } catch (error) {
        console.error('Get post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy bài viết', error: error.message });
    }
};

/**
 * PUT /api/posts/:id - Update own post
 */
PostController.updatePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        const {
            content, media_urls, media_type, visibility,
            title, hashtags, location, thumbnail_url, duration, related_piano_id
        } = req.body;

        // Verify ownership
        const { data: existing } = await supabaseAdmin
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();

        if (!existing || existing.user_id !== userId) {
            return res.status(403).json({ success: false, message: 'Không có quyền sửa bài viết này' });
        }

        const updates = {};
        if (content !== undefined) updates.content = content.trim();
        if (media_urls !== undefined) updates.media_urls = media_urls;
        if (media_type !== undefined) updates.media_type = media_type;
        if (visibility !== undefined) updates.visibility = visibility;
        if (title !== undefined) updates.title = title?.trim() || null;
        if (hashtags !== undefined) {
            updates.hashtags = [...new Set(hashtags.map(h => h.toLowerCase().trim().replace(/^#/, '')).filter(Boolean))];
        }
        if (location !== undefined) updates.location = location?.trim() || null;
        if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url;
        if (duration !== undefined) updates.duration = duration;
        if (related_piano_id !== undefined) updates.related_piano_id = related_piano_id;

        const { data, error } = await supabaseAdmin
            .from('posts')
            .update(updates)
            .eq('id', postId)
            .select('*')
            .single();

        if (error) throw error;

        const [enriched] = await enrichWithProfiles([data]);

        res.json({ success: true, message: 'Cập nhật thành công', data: enriched });
    } catch (error) {
        console.error('Update post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi cập nhật bài viết', error: error.message });
    }
};

/**
 * DELETE /api/posts/:id - Delete own post (or admin)
 */
PostController.deletePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.user_metadata?.role || req.user.app_metadata?.role || 'user';

        // Verify ownership or admin
        const { data: existing } = await supabaseAdmin
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();

        if (!existing) {
            return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
        }

        if (existing.user_id !== userId && userRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Không có quyền xóa bài viết này' });
        }

        const { error } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) throw error;

        res.json({ success: true, message: 'Xóa bài viết thành công' });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa bài viết', error: error.message });
    }
};

// ============================================================================
// LIKES
// ============================================================================

/**
 * POST /api/posts/:id/like - Like a post
 */
PostController.likePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;

        const { error } = await supabaseAdmin
            .from('post_likes')
            .insert({ post_id: postId, user_id: userId });

        if (error) {
            if (error.code === '23505') { // unique violation
                return res.status(409).json({ success: false, message: 'Bạn đã like bài viết này rồi' });
            }
            throw error;
        }

        // Get updated count
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('likes_count')
            .eq('id', postId)
            .single();

        res.json({
            success: true,
            message: 'Liked',
            data: { likes_count: post?.likes_count || 0, is_liked: true }
        });
    } catch (error) {
        console.error('Like post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi like bài viết', error: error.message });
    }
};

/**
 * DELETE /api/posts/:id/like - Unlike a post
 */
PostController.unlikePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;

        const { error } = await supabaseAdmin
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', userId);

        if (error) throw error;

        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('likes_count')
            .eq('id', postId)
            .single();

        res.json({
            success: true,
            message: 'Unliked',
            data: { likes_count: post?.likes_count || 0, is_liked: false }
        });
    } catch (error) {
        console.error('Unlike post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi unlike bài viết', error: error.message });
    }
};

// ============================================================================
// COMMENTS
// ============================================================================

/**
 * GET /api/posts/:id/comments - Get comments for a post
 * Query: ?cursor=ISO_TIMESTAMP&limit=20
 */
PostController.getComments = async (req, res) => {
    try {
        const postId = req.params.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('post_comments')
            .select('*')
            .eq('post_id', postId)
            .is('parent_id', null) // Top-level comments only
            .order('created_at', { ascending: true })
            .limit(limit + 1);

        if (cursor) {
            query = query.gt('created_at', cursor);
        }

        const { data: comments, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(comments, limit);
        response.data = await enrichWithProfiles(response.data);

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy bình luận', error: error.message });
    }
};

/**
 * GET /api/comments/:id/replies - Get replies for a comment
 */
PostController.getReplies = async (req, res) => {
    try {
        const parentId = req.params.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('post_comments')
            .select('*')
            .eq('parent_id', parentId)
            .order('created_at', { ascending: true })
            .limit(limit + 1);

        if (cursor) {
            query = query.gt('created_at', cursor);
        }

        const { data: replies, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(replies, limit);
        response.data = await enrichWithProfiles(response.data);

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get replies error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy replies', error: error.message });
    }
};

/**
 * POST /api/posts/:id/comments - Add a comment
 */
PostController.addComment = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        const { content, parent_id } = req.body;

        if (!content?.trim()) {
            return res.status(400).json({ success: false, message: 'Nội dung bình luận là bắt buộc' });
        }

        // Verify post exists
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('id', postId)
            .single();

        if (!post) {
            return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
        }

        const { data, error } = await supabaseAdmin
            .from('post_comments')
            .insert({
                post_id: postId,
                user_id: userId,
                content: content.trim(),
                parent_id: parent_id || null
            })
            .select('*')
            .single();

        if (error) throw error;

        const [enriched] = await enrichWithProfiles([data]);

        res.status(201).json({ success: true, message: 'Bình luận thành công', data: enriched });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ success: false, message: 'Lỗi bình luận', error: error.message });
    }
};

/**
 * DELETE /api/comments/:id - Delete a comment (owner or admin)
 */
PostController.deleteComment = async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.user_metadata?.role || req.user.app_metadata?.role || 'user';

        const { data: existing } = await supabaseAdmin
            .from('post_comments')
            .select('user_id')
            .eq('id', commentId)
            .single();

        if (!existing) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        if (existing.user_id !== userId && userRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Không có quyền xóa bình luận này' });
        }

        const { error } = await supabaseAdmin
            .from('post_comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;

        res.json({ success: true, message: 'Xóa bình luận thành công' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa bình luận', error: error.message });
    }
};

// ============================================================================
// VIEW TRACKING
// ============================================================================

/**
 * POST /api/posts/:id/view - Track a view on a post
 * Unique per user (authenticated) or per IP (anonymous).
 * Client should debounce: only call after user stays ≥3s on a post.
 */
PostController.trackView = async (req, res) => {
    try {
        const postId = req.params.id;
        const viewerId = req.user?.id || null;
        const viewerIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.connection?.remoteAddress
            || req.ip;

        // Verify post exists
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('id', postId)
            .single();

        if (!post) {
            return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
        }

        // Check if already viewed
        let alreadyViewed = false;
        if (viewerId) {
            // Authenticated user: unique by (post_id, viewer_id)
            const { data: existing } = await supabaseAdmin
                .from('post_views')
                .select('id')
                .eq('post_id', postId)
                .eq('viewer_id', viewerId)
                .maybeSingle();
            alreadyViewed = !!existing;
        } else if (viewerIp) {
            // Anonymous: unique by (post_id, viewer_ip)
            const { data: existing } = await supabaseAdmin
                .from('post_views')
                .select('id')
                .eq('post_id', postId)
                .is('viewer_id', null)
                .eq('viewer_ip', viewerIp)
                .maybeSingle();
            alreadyViewed = !!existing;
        }

        if (alreadyViewed) {
            // Already counted, return current count
            const { data: currentPost } = await supabaseAdmin
                .from('posts')
                .select('views_count')
                .eq('id', postId)
                .single();
            return res.json({
                success: true,
                message: 'Đã xem trước đó',
                data: { views_count: currentPost?.views_count || 0, is_new_view: false }
            });
        }

        // Insert new view
        const { error } = await supabaseAdmin
            .from('post_views')
            .insert({
                post_id: postId,
                viewer_id: viewerId,
                viewer_ip: viewerIp || null
            });

        if (error) {
            // Handle unique constraint violation gracefully (race condition)
            if (error.code === '23505') {
                const { data: currentPost } = await supabaseAdmin
                    .from('posts')
                    .select('views_count')
                    .eq('id', postId)
                    .single();
                return res.json({
                    success: true,
                    message: 'Đã xem trước đó',
                    data: { views_count: currentPost?.views_count || 0, is_new_view: false }
                });
            }
            throw error;
        }

        // Get updated count (trigger already updated it)
        const { data: updatedPost } = await supabaseAdmin
            .from('posts')
            .select('views_count')
            .eq('id', postId)
            .single();

        res.json({
            success: true,
            message: 'Đã ghi nhận lượt xem',
            data: { views_count: updatedPost?.views_count || 0, is_new_view: true }
        });
    } catch (error) {
        console.error('Track view error:', error);
        res.status(500).json({ success: false, message: 'Lỗi ghi nhận lượt xem', error: error.message });
    }
};

// ============================================================================
// SHARE TRACKING
// ============================================================================

/**
 * POST /api/posts/:id/share - Track a share on a post
 */
PostController.sharePost = async (req, res) => {
    try {
        const postId = req.params.id;

        // Get current count
        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('shares_count')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
        }

        // Increment shares_count
        const { data: updatedPost, error } = await supabaseAdmin
            .from('posts')
            .update({ shares_count: (post.shares_count || 0) + 1 })
            .eq('id', postId)
            .select('shares_count')
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Chia sẻ thành công',
            data: { shares_count: updatedPost?.shares_count || 0 }
        });
    } catch (error) {
        console.error('Share post error:', error);
        res.status(500).json({ success: false, message: 'Lỗi chia sẻ bài viết', error: error.message });
    }
};

// ============================================================================
// HASHTAGS
// ============================================================================

/**
 * GET /api/posts/hashtags/trending - Get trending hashtags
 * Query: ?limit=20
 */
PostController.trendingHashtags = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);

        const { data: hashtags, error } = await supabaseAdmin
            .from('hashtags')
            .select('*')
            .gt('posts_count', 0)
            .order('posts_count', { ascending: false })
            .limit(limit);

        if (error) throw error;

        res.json({ success: true, data: hashtags || [] });
    } catch (error) {
        console.error('Trending hashtags error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy trending hashtags', error: error.message });
    }
};

/**
 * GET /api/posts/hashtags/search - Search/suggest hashtags
 * Query: ?q=pia&limit=10
 */
PostController.searchHashtags = async (req, res) => {
    try {
        const { q } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 10, 30);

        if (!q || q.trim().length === 0) {
            return res.json({ success: true, data: [] });
        }

        const searchTerm = q.toLowerCase().trim().replace(/^#/, '');

        const { data: hashtags, error } = await supabaseAdmin
            .from('hashtags')
            .select('*')
            .ilike('name', `${searchTerm}%`)
            .order('posts_count', { ascending: false })
            .limit(limit);

        if (error) throw error;

        res.json({ success: true, data: hashtags || [] });
    } catch (error) {
        console.error('Search hashtags error:', error);
        res.status(500).json({ success: false, message: 'Lỗi tìm hashtag', error: error.message });
    }
};

module.exports = PostController;
