const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const ModerationController = {};

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
// CONTENT REPORTS (User-facing)
// ============================================================================

/**
 * POST /api/moderation/reports — Submit a content report
 */
ModerationController.createReport = async (req, res) => {
    try {
        const reporterId = req.user.id;
        const { content_type, content_id, target_user_id, reason, description } = req.body;

        if (!content_type || !content_id || !reason) {
            return res.status(400).json({ success: false, message: 'content_type, content_id, reason là bắt buộc' });
        }

        // Prevent duplicate reports
        const { data: existing } = await supabaseAdmin
            .from('content_reports')
            .select('id')
            .eq('reporter_id', reporterId)
            .eq('content_type', content_type)
            .eq('content_id', content_id)
            .eq('status', 'pending')
            .single();

        if (existing) {
            return res.status(409).json({ success: false, message: 'Bạn đã báo cáo nội dung này rồi' });
        }

        const { data, error } = await supabaseAdmin
            .from('content_reports')
            .insert({
                reporter_id: reporterId,
                content_type,
                content_id,
                target_user_id: target_user_id || null,
                reason,
                description: description?.trim() || null
            })
            .select('*')
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, message: 'Báo cáo đã được gửi', data });
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ success: false, message: 'Lỗi gửi báo cáo', error: error.message });
    }
};

/**
 * GET /api/moderation/reports/mine — User's own reports
 */
ModerationController.getMyReports = async (req, res) => {
    try {
        const userId = req.user.id;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('content_reports')
            .select('*')
            .eq('reporter_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) query = query.lt('created_at', cursor);

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, ...buildPaginatedResponse(data, limit) });
    } catch (error) {
        console.error('Get my reports error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy báo cáo', error: error.message });
    }
};

// ============================================================================
// ADMIN MODERATION
// ============================================================================

/**
 * GET /api/moderation/admin/reports — List all reports (admin only)
 */
ModerationController.getReports = async (req, res) => {
    try {
        const { status, content_type, reason } = req.query;
        const { cursor, limit } = parsePagination(req.query);

        let query = supabaseAdmin
            .from('content_reports')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (status) query = query.eq('status', status);
        if (content_type) query = query.eq('content_type', content_type);
        if (reason) query = query.eq('reason', reason);
        if (cursor) query = query.lt('created_at', cursor);

        const { data, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(data, limit);

        // Enrich with reporter profiles
        const reporterIds = [...new Set(response.data.map(r => r.reporter_id))];
        const profileMap = await fetchProfiles(reporterIds);
        response.data = response.data.map(r => ({
            ...r,
            reporter: profileMap[r.reporter_id] || { id: r.reporter_id }
        }));

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách báo cáo', error: error.message });
    }
};

/**
 * PUT /api/moderation/admin/reports/:id — Review a report (admin only)
 */
ModerationController.reviewReport = async (req, res) => {
    try {
        const reportId = req.params.id;
        const adminId = req.user.id;
        const { status, action_taken } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'status là bắt buộc' });
        }

        const updates = {
            status,
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString()
        };
        if (action_taken) updates.action_taken = action_taken;

        const { data, error } = await supabaseAdmin
            .from('content_reports')
            .update(updates)
            .eq('id', reportId)
            .select('*')
            .single();

        if (error) throw error;

        // If action is content_removed, actually remove the content
        if (action_taken === 'content_removed' && data) {
            await removeContent(data.content_type, data.content_id);
        }

        res.json({ success: true, message: 'Đã xử lý báo cáo', data });
    } catch (error) {
        console.error('Review report error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xử lý báo cáo', error: error.message });
    }
};

/**
 * Remove flagged content based on type.
 */
async function removeContent(contentType, contentId) {
    try {
        let table;
        switch (contentType) {
            case 'post': table = 'posts'; break;
            case 'comment': table = 'post_comments'; break;
            case 'message':
                // Soft delete
                await supabaseAdmin.from('messages').update({ is_deleted: true }).eq('id', contentId);
                return;
            default: return;
        }
        await supabaseAdmin.from(table).delete().eq('id', contentId);
    } catch (err) {
        console.error('Remove content error:', err);
    }
}

/**
 * GET /api/moderation/admin/stats — Moderation dashboard stats
 */
ModerationController.getStats = async (req, res) => {
    try {
        const { count: pending } = await supabaseAdmin
            .from('content_reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: today } = await supabaseAdmin
            .from('content_reports')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

        const { count: resolved } = await supabaseAdmin
            .from('content_reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'resolved');

        const { count: total } = await supabaseAdmin
            .from('content_reports')
            .select('id', { count: 'exact', head: true });

        res.json({
            success: true,
            data: {
                pending: pending || 0,
                reports_today: today || 0,
                resolved: resolved || 0,
                total: total || 0
            }
        });
    } catch (error) {
        console.error('Get moderation stats error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy thống kê', error: error.message });
    }
};

module.exports = ModerationController;
