-- ==============================================================================
-- PHASE 3: CLASSROOM FOUNDATION SCHEMA
-- ==============================================================================
-- HƯỚNG DẪN: Vào Supabase SQL Editor → Paste → Run
-- ==============================================================================

-- 1. LIVE SESSIONS (Buổi học trực tuyến)
CREATE TABLE IF NOT EXISTS public.live_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    room_id VARCHAR(255),               -- LiveKit room name
    status VARCHAR(20) DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
    max_participants INTEGER DEFAULT 50,
    recording_url TEXT,
    settings JSONB DEFAULT '{}',        -- { allow_chat, allow_screen_share, ... }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SESSION PARTICIPANTS
CREATE TABLE IF NOT EXISTS public.session_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'student'
        CHECK (role IN ('teacher', 'student', 'guest')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    UNIQUE(session_id, user_id)
);

-- 3. SESSION CHAT (In-class chat messages)
CREATE TABLE IF NOT EXISTS public.session_chat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text'
        CHECK (message_type IN ('text', 'emoji', 'file', 'system')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON public.live_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course ON public.live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.live_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled ON public.live_sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON public.session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user ON public.session_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_session ON public.session_chat(session_id, created_at);

-- ==============================================================================
-- ENABLE RLS
-- ==============================================================================
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_chat ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- LIVE SESSIONS
CREATE POLICY "Anyone can view sessions" ON public.live_sessions
    FOR SELECT USING (true);
CREATE POLICY "Teachers create sessions" ON public.live_sessions
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers update own sessions" ON public.live_sessions
    FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers delete own sessions" ON public.live_sessions
    FOR DELETE USING (auth.uid() = teacher_id);

-- SESSION PARTICIPANTS
CREATE POLICY "Anyone can view participants" ON public.session_participants
    FOR SELECT USING (true);
CREATE POLICY "Users join sessions" ON public.session_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users leave sessions" ON public.session_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- SESSION CHAT
CREATE POLICY "Participants view chat" ON public.session_chat
    FOR SELECT USING (
        session_id IN (SELECT session_id FROM public.session_participants WHERE user_id = auth.uid())
    );
CREATE POLICY "Participants send chat" ON public.session_chat
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- TRIGGER: auto-update updated_at
-- ==============================================================================
CREATE TRIGGER update_live_sessions_updated_at
    BEFORE UPDATE ON public.live_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- DONE! Phase 3 Classroom tables created.
-- ==============================================================================
