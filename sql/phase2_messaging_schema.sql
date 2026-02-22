-- ==============================================================================
-- PHASE 2: MESSAGING & NOTIFICATIONS SCHEMA
-- ==============================================================================
-- HƯỚNG DẪN: Vào Supabase SQL Editor → Paste → Run
-- ==============================================================================

-- 1. CONVERSATIONS (Cuộc hội thoại - hỗ trợ 1-1 và nhóm)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(10) DEFAULT 'direct'
        CHECK (type IN ('direct', 'group')),
    name VARCHAR(200),           -- NULL for direct, name for group
    avatar_url TEXT,             -- Group avatar
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONVERSATION MEMBERS
CREATE TABLE IF NOT EXISTS public.conversation_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(10) DEFAULT 'member'
        CHECK (role IN ('admin', 'member')),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    is_muted BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- 3. MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'file', 'system')),
    media_url TEXT,
    reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('like', 'comment', 'follow', 'message', 'system',
                        'course_enrolled', 'session_invite', 'teacher_approved')),
    title VARCHAR(200),
    body TEXT,
    data JSONB DEFAULT '{}',       -- { post_id, comment_id, sender_id, ... }
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON public.conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON public.conversations(last_message_at DESC);

-- ==============================================================================
-- ENABLE RLS
-- ==============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- CONVERSATIONS: members only
CREATE POLICY "Members view conversations" ON public.conversations
    FOR SELECT USING (
        id IN (SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid())
    );

-- CONVERSATION MEMBERS
CREATE POLICY "Members view members" ON public.conversation_members
    FOR SELECT USING (
        conversation_id IN (SELECT conversation_id FROM public.conversation_members cm WHERE cm.user_id = auth.uid())
    );
CREATE POLICY "Users manage own membership" ON public.conversation_members
    FOR ALL USING (auth.uid() = user_id);

-- MESSAGES: conversation members only
CREATE POLICY "Members view messages" ON public.messages
    FOR SELECT USING (
        conversation_id IN (SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid())
    );
CREATE POLICY "Members send messages" ON public.messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        conversation_id IN (SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid())
    );
CREATE POLICY "Users edit own messages" ON public.messages
    FOR UPDATE USING (auth.uid() = sender_id);

-- NOTIFICATIONS: own only
CREATE POLICY "Users view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- ==============================================================================
-- TRIGGERS
-- ==============================================================================

-- Auto-update conversation's last_message when a new message is inserted
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_new_message
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Auto-update updated_at for messages
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- DONE! Phase 2 Messaging & Notifications tables created.
-- ==============================================================================
