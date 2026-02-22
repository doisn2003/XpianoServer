const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const NotificationController = {};

/**
 * GET /api/notifications - Get user's notifications
 * Query: ?cursor=ISO&limit=20&unread_only=true
 */
NotificationController.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { cursor, limit } = parsePagination(req.query);
        const { unread_only } = req.query;

        let query = supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        if (unread_only === 'true') {
            query = query.eq('is_read', false);
        }

        const { data: notifications, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(notifications, limit);
        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy thông báo', error: error.message });
    }
};

/**
 * GET /api/notifications/unread-count - Get unread notification count
 */
NotificationController.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;

        const { count, error } = await supabaseAdmin
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ success: true, data: { unread_count: count || 0 } });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ success: false, message: 'Lỗi đếm thông báo', error: error.message });
    }
};

/**
 * PUT /api/notifications/:id/read - Mark one notification as read
 */
NotificationController.markAsRead = async (req, res) => {
    try {
        const notifId = req.params.id;
        const userId = req.user.id;

        const { error } = await supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notifId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ success: true, message: 'Đã đọc' });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ success: false, message: 'Lỗi đánh dấu đã đọc', error: error.message });
    }
};

/**
 * PUT /api/notifications/read-all - Mark all notifications as read
 */
NotificationController.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        const { error } = await supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ success: true, message: 'Đã đọc tất cả' });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ success: false, message: 'Lỗi đánh dấu đã đọc', error: error.message });
    }
};

/**
 * DELETE /api/notifications/:id - Delete a notification
 */
NotificationController.deleteNotification = async (req, res) => {
    try {
        const notifId = req.params.id;
        const userId = req.user.id;

        const { error } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('id', notifId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ success: true, message: 'Đã xóa thông báo' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa thông báo', error: error.message });
    }
};

module.exports = NotificationController;
