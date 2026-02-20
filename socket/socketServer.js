/**
 * Socket.io server setup for real-time messaging & notifications.
 *
 * Events emitted by server:
 *   - new_message        → to conversation room
 *   - message_deleted     → to conversation room
 *   - user_typing         → to conversation room
 *   - user_stop_typing    → to conversation room
 *   - new_notification    → to user's personal room
 *   - unread_count        → to user's personal room
 *
 * Events listened from client:
 *   - join_conversations  → client sends list of conversation IDs
 *   - send_message        → { conversation_id, content, message_type, media_url, reply_to_id }
 *   - typing              → { conversation_id }
 *   - stop_typing         → { conversation_id }
 *   - mark_read           → { conversation_id }
 */

const { Server } = require('socket.io');
const { supabase } = require('../utils/supabaseClient');
const { supabaseAdmin } = require('../utils/supabaseClient');

let io = null;

function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Auth middleware — verify Supabase token
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error('Token required'));

            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (error || !user) return next(new Error('Invalid token'));

            socket.user = user;
            next();
        } catch (err) {
            next(new Error('Auth failed'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.user.id;
        console.log(`🔌 Socket connected: ${userId}`);

        // Join personal room for notifications
        socket.join(`user:${userId}`);

        // Send unread notification count on connect
        const { count } = await supabaseAdmin
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);
        socket.emit('unread_count', { count: count || 0 });

        // ---- JOIN CONVERSATION ROOMS ----
        socket.on('join_conversations', async (conversationIds) => {
            if (!Array.isArray(conversationIds)) return;

            // Verify membership
            const { data: memberships } = await supabaseAdmin
                .from('conversation_members')
                .select('conversation_id')
                .eq('user_id', userId)
                .in('conversation_id', conversationIds);

            const validIds = (memberships || []).map(m => m.conversation_id);
            validIds.forEach(cid => socket.join(`conv:${cid}`));
        });

        // ---- SEND MESSAGE (via socket — alternative to REST) ----
        socket.on('send_message', async (data, callback) => {
            try {
                const { conversation_id, content, message_type, media_url, reply_to_id } = data;

                if (!conversation_id || (!content && !media_url)) {
                    return callback?.({ error: 'Missing data' });
                }

                // Verify membership
                const { data: member } = await supabaseAdmin
                    .from('conversation_members')
                    .select('id')
                    .eq('conversation_id', conversation_id)
                    .eq('user_id', userId)
                    .single();

                if (!member) return callback?.({ error: 'Not a member' });

                // Insert message
                const { data: msg, error } = await supabaseAdmin
                    .from('messages')
                    .insert({
                        conversation_id,
                        sender_id: userId,
                        content: content?.trim() || null,
                        message_type: message_type || 'text',
                        media_url: media_url || null,
                        reply_to_id: reply_to_id || null
                    })
                    .select('*')
                    .single();

                if (error) return callback?.({ error: error.message });

                // Fetch sender profile
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, avatar_url, role')
                    .eq('id', userId)
                    .single();

                const enrichedMsg = { ...msg, author: profile || { id: userId } };

                // Broadcast to conversation room
                io.to(`conv:${conversation_id}`).emit('new_message', enrichedMsg);

                // Create notifications for other members
                const { data: members } = await supabaseAdmin
                    .from('conversation_members')
                    .select('user_id')
                    .eq('conversation_id', conversation_id)
                    .neq('user_id', userId);

                if (members && members.length > 0) {
                    const notifications = members.map(m => ({
                        user_id: m.user_id,
                        type: 'message',
                        title: `Tin nhắn mới từ ${profile?.full_name || 'Người dùng'}`,
                        body: content ? content.substring(0, 100) : '📎 Media',
                        data: { conversation_id, message_id: msg.id, sender_id: userId }
                    }));

                    await supabaseAdmin.from('notifications').insert(notifications);

                    // Push real-time notification to each member
                    members.forEach(m => {
                        io.to(`user:${m.user_id}`).emit('new_notification', notifications.find(n => n.user_id === m.user_id));
                    });
                }

                callback?.({ success: true, data: enrichedMsg });
            } catch (err) {
                console.error('Socket send_message error:', err);
                callback?.({ error: err.message });
            }
        });

        // ---- TYPING INDICATORS ----
        socket.on('typing', ({ conversation_id }) => {
            socket.to(`conv:${conversation_id}`).emit('user_typing', {
                conversation_id,
                user_id: userId
            });
        });

        socket.on('stop_typing', ({ conversation_id }) => {
            socket.to(`conv:${conversation_id}`).emit('user_stop_typing', {
                conversation_id,
                user_id: userId
            });
        });

        // ---- MARK READ ----
        socket.on('mark_read', async ({ conversation_id }) => {
            await supabaseAdmin
                .from('conversation_members')
                .update({ last_read_at: new Date().toISOString() })
                .eq('conversation_id', conversation_id)
                .eq('user_id', userId);
        });

        // ---- SESSION ROOMS (Classroom) ----
        socket.on('join_session', async (sessionId) => {
            // Verify participant
            const { data: participant } = await supabaseAdmin
                .from('session_participants')
                .select('id')
                .eq('session_id', sessionId)
                .eq('user_id', userId)
                .is('left_at', null)
                .single();

            if (participant) {
                socket.join(`session:${sessionId}`);
            }
        });

        socket.on('session_chat_msg', async (data, callback) => {
            try {
                const { session_id, message, message_type } = data;
                if (!session_id || !message?.trim()) return callback?.({ error: 'Missing data' });

                const { data: msg, error } = await supabaseAdmin
                    .from('session_chat')
                    .insert({
                        session_id,
                        user_id: userId,
                        message: message.trim(),
                        message_type: message_type || 'text'
                    })
                    .select('*')
                    .single();

                if (error) return callback?.({ error: error.message });

                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, avatar_url, role')
                    .eq('id', userId)
                    .single();

                const enriched = { ...msg, author: profile || { id: userId } };
                io.to(`session:${session_id}`).emit('session_chat', enriched);
                callback?.({ success: true, data: enriched });
            } catch (err) {
                callback?.({ error: err.message });
            }
        });

        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${userId}`);
        });
    });

    console.log('✅ Socket.io initialized');
    return io;
}

/**
 * Get the Socket.io instance (for use in controllers).
 */
function getIO() {
    return io;
}

/**
 * Emit a notification to a specific user via their personal room.
 */
async function emitNotification(userId, notification) {
    if (!io) return;
    io.to(`user:${userId}`).emit('new_notification', notification);

    // Also update unread count
    const { count } = await supabaseAdmin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
    io.to(`user:${userId}`).emit('unread_count', { count: count || 0 });
}

module.exports = { initSocket, getIO, emitNotification };
