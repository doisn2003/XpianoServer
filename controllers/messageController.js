const { supabaseAdmin } = require('../utils/supabaseClient');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');
const { getIO, emitNotification } = require('../socket/socketServer');

const MessageController = {};

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
// CONVERSATIONS
// ============================================================================

/**
 * POST /api/messages/conversations - Create or get existing direct conversation
 * Body: { user_id } for direct, { user_ids, name } for group
 */
MessageController.createConversation = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { user_id, user_ids, name, type } = req.body;

        // Direct message (1-1)
        if (!type || type === 'direct') {
            if (!user_id) {
                return res.status(400).json({ success: false, message: 'user_id là bắt buộc' });
            }

            if (user_id === currentUserId) {
                return res.status(400).json({ success: false, message: 'Không thể nhắn tin cho chính mình' });
            }

            // Check if direct conversation already exists between these two users
            const { data: myConvos } = await supabaseAdmin
                .from('conversation_members')
                .select('conversation_id')
                .eq('user_id', currentUserId);

            const myConvoIds = (myConvos || []).map(c => c.conversation_id);

            if (myConvoIds.length > 0) {
                const { data: shared } = await supabaseAdmin
                    .from('conversation_members')
                    .select('conversation_id')
                    .eq('user_id', user_id)
                    .in('conversation_id', myConvoIds);

                if (shared && shared.length > 0) {
                    for (const s of shared) {
                        const { data: conv } = await supabaseAdmin
                            .from('conversations')
                            .select('*')
                            .eq('id', s.conversation_id)
                            .eq('type', 'direct')
                            .single();

                        if (conv) {
                            const profileMap = await fetchProfiles([user_id]);
                            return res.json({
                                success: true,
                                message: 'Cuộc hội thoại đã tồn tại',
                                data: { ...conv, other_user: profileMap[user_id] || { id: user_id } }
                            });
                        }
                    }
                }
            }

            // Create new direct conversation
            const { data: conv, error: convErr } = await supabaseAdmin
                .from('conversations')
                .insert({ type: 'direct', created_by: currentUserId })
                .select('*')
                .single();

            if (convErr) throw convErr;

            // Add both members
            await supabaseAdmin
                .from('conversation_members')
                .insert([
                    { conversation_id: conv.id, user_id: currentUserId, role: 'admin' },
                    { conversation_id: conv.id, user_id: user_id, role: 'member' }
                ]);

            const profileMap = await fetchProfiles([user_id]);

            res.status(201).json({
                success: true,
                message: 'Tạo cuộc hội thoại thành công',
                data: { ...conv, other_user: profileMap[user_id] || { id: user_id } }
            });

        } else if (type === 'group') {
            // Group conversation
            const memberIds = user_ids || [];
            if (memberIds.length < 1) {
                return res.status(400).json({ success: false, message: 'Cần ít nhất 1 thành viên khác' });
            }

            const allIds = [currentUserId, ...memberIds.filter(id => id !== currentUserId)];

            const { data: conv, error: convErr } = await supabaseAdmin
                .from('conversations')
                .insert({
                    type: 'group',
                    name: name || 'Nhóm chat',
                    created_by: currentUserId
                })
                .select('*')
                .single();

            if (convErr) throw convErr;

            const membersInsert = allIds.map(uid => ({
                conversation_id: conv.id,
                user_id: uid,
                role: uid === currentUserId ? 'admin' : 'member'
            }));

            await supabaseAdmin.from('conversation_members').insert(membersInsert);

            res.status(201).json({
                success: true,
                message: 'Tạo nhóm chat thành công',
                data: conv
            });
        }
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ success: false, message: 'Lỗi tạo cuộc hội thoại', error: error.message });
    }
};

/**
 * GET /api/messages/conversations - Get user's conversations
 */
MessageController.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;
        const { cursor, limit } = parsePagination(req.query);

        // Get conversation IDs the user belongs to
        const { data: memberships } = await supabaseAdmin
            .from('conversation_members')
            .select('conversation_id, last_read_at, is_muted')
            .eq('user_id', userId);

        if (!memberships || memberships.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { has_more: false, next_cursor: null, count: 0 }
            });
        }

        const memberMap = {};
        memberships.forEach(m => { memberMap[m.conversation_id] = m; });
        const convIds = Object.keys(memberMap);

        let query = supabaseAdmin
            .from('conversations')
            .select('*')
            .in('id', convIds)
            .order('last_message_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('last_message_at', cursor);
        }

        const { data: conversations, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(conversations, limit);

        // For direct conversations, fetch other user's profile
        const directConvs = response.data.filter(c => c.type === 'direct');
        let otherUserMap = {};

        if (directConvs.length > 0) {
            const directIds = directConvs.map(c => c.id);
            const { data: allMembers } = await supabaseAdmin
                .from('conversation_members')
                .select('conversation_id, user_id')
                .in('conversation_id', directIds);

            // For each direct conv, find the other user
            const otherIds = [];
            const convToOther = {};
            (allMembers || []).forEach(m => {
                if (m.user_id !== userId) {
                    otherIds.push(m.user_id);
                    convToOther[m.conversation_id] = m.user_id;
                }
            });

            if (otherIds.length > 0) {
                otherUserMap = await fetchProfiles([...new Set(otherIds)]);
            }

            response.data = response.data.map(conv => {
                const meta = memberMap[conv.id] || {};
                const otherId = convToOther[conv.id];
                return {
                    ...conv,
                    last_read_at: meta.last_read_at,
                    is_muted: meta.is_muted,
                    other_user: conv.type === 'direct' && otherId
                        ? otherUserMap[otherId] || { id: otherId }
                        : undefined,
                    has_unread: meta.last_read_at
                        ? new Date(conv.last_message_at) > new Date(meta.last_read_at)
                        : true
                };
            });
        } else {
            response.data = response.data.map(conv => {
                const meta = memberMap[conv.id] || {};
                return {
                    ...conv,
                    last_read_at: meta.last_read_at,
                    is_muted: meta.is_muted,
                    has_unread: meta.last_read_at
                        ? new Date(conv.last_message_at) > new Date(meta.last_read_at)
                        : true
                };
            });
        }

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy danh sách hội thoại', error: error.message });
    }
};

/**
 * GET /api/messages/conversations/:id/messages - Get messages in a conversation
 */
MessageController.getMessages = async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.user.id;
        const { cursor, limit } = parsePagination(req.query);

        // Verify membership
        const { data: member } = await supabaseAdmin
            .from('conversation_members')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!member) {
            return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
        }

        let query = supabaseAdmin
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data: messages, error } = await query;
        if (error) throw error;

        const response = buildPaginatedResponse(messages, limit);

        // Enrich with sender profiles
        const senderIds = [...new Set(response.data.map(m => m.sender_id))];
        const profileMap = await fetchProfiles(senderIds);
        response.data = response.data.map(m => ({
            ...m,
            author: profileMap[m.sender_id] || { id: m.sender_id }
        }));

        // Update last_read_at
        await supabaseAdmin
            .from('conversation_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: 'Lỗi lấy tin nhắn', error: error.message });
    }
};

/**
 * POST /api/messages/conversations/:id/messages - Send a message (REST alternative to socket)
 */
MessageController.sendMessage = async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.user.id;
        const { content, message_type, media_url, reply_to_id } = req.body;

        if (!content?.trim() && !media_url) {
            return res.status(400).json({ success: false, message: 'Nội dung hoặc media là bắt buộc' });
        }

        // Verify membership
        const { data: member } = await supabaseAdmin
            .from('conversation_members')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!member) {
            return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
        }

        const { data: msg, error } = await supabaseAdmin
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_id: userId,
                content: content?.trim() || null,
                message_type: message_type || 'text',
                media_url: media_url || null,
                reply_to_id: reply_to_id || null
            })
            .select('*')
            .single();

        if (error) throw error;

        // Fetch sender profile
        const profileMap = await fetchProfiles([userId]);
        const enrichedMsg = { ...msg, author: profileMap[userId] || { id: userId } };

        // Broadcast via Socket.io
        const io = getIO();
        if (io) {
            io.to(`conv:${conversationId}`).emit('new_message', enrichedMsg);
        }

        // Create notifications for other members
        const { data: members } = await supabaseAdmin
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', userId);

        if (members && members.length > 0) {
            const senderName = profileMap[userId]?.full_name || 'Người dùng';
            const notifications = members.map(m => ({
                user_id: m.user_id,
                type: 'message',
                title: `Tin nhắn mới từ ${senderName}`,
                body: content ? content.substring(0, 100) : '📎 Media',
                data: { conversation_id: conversationId, message_id: msg.id, sender_id: userId }
            }));

            await supabaseAdmin.from('notifications').insert(notifications);

            // Push real-time
            for (const notif of notifications) {
                await emitNotification(notif.user_id, notif);
            }
        }

        res.status(201).json({ success: true, message: 'Gửi tin nhắn thành công', data: enrichedMsg });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: 'Lỗi gửi tin nhắn', error: error.message });
    }
};

/**
 * DELETE /api/messages/:id - Soft-delete a message
 */
MessageController.deleteMessage = async (req, res) => {
    try {
        const messageId = req.params.id;
        const userId = req.user.id;

        const { data: msg } = await supabaseAdmin
            .from('messages')
            .select('sender_id, conversation_id')
            .eq('id', messageId)
            .single();

        if (!msg) {
            return res.status(404).json({ success: false, message: 'Tin nhắn không tồn tại' });
        }

        if (msg.sender_id !== userId) {
            return res.status(403).json({ success: false, message: 'Không có quyền xóa tin nhắn này' });
        }

        await supabaseAdmin
            .from('messages')
            .update({ is_deleted: true, content: null, media_url: null })
            .eq('id', messageId);

        const io = getIO();
        if (io) {
            io.to(`conv:${msg.conversation_id}`).emit('message_deleted', { id: messageId, conversation_id: msg.conversation_id });
        }

        res.json({ success: true, message: 'Đã xóa tin nhắn' });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa tin nhắn', error: error.message });
    }
};

module.exports = MessageController;
