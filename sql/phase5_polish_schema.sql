-- ==============================================================================
-- PHASE 5: POLISH & SCALE SCHEMA
-- ==============================================================================
-- HƯỚNG DẪN: Vào Supabase SQL Editor → Paste → Run
-- ==============================================================================

-- 1. CONTENT REPORTS (Moderation system)
CREATE TABLE IF NOT EXISTS public.content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_type VARCHAR(30) NOT NULL
        CHECK (content_type IN ('post', 'comment', 'message', 'user', 'session')),
    content_id UUID NOT NULL,            -- ID of the reported content
    target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason VARCHAR(50) NOT NULL
        CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'violence',
                           'copyright', 'misinformation', 'other')),
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    action_taken VARCHAR(30)
        CHECK (action_taken IN (NULL, 'none', 'warning', 'content_removed',
                                 'user_suspended', 'user_banned')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SESSION ANALYTICS (Learning stats)
CREATE TABLE IF NOT EXISTS public.session_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    join_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    leave_time TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    engagement_score DECIMAL(3,2) DEFAULT 0,      -- 0.00 - 1.00
    chat_messages_count INTEGER DEFAULT 0,
    connection_quality VARCHAR(20) DEFAULT 'good'
        CHECK (connection_quality IN ('excellent', 'good', 'fair', 'poor')),
    device_info JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, user_id, join_time)
);

-- 3. USER LEARNING STATS (Aggregated per-user)
CREATE TABLE IF NOT EXISTS public.user_learning_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    total_sessions_attended INTEGER DEFAULT 0,
    total_learning_minutes INTEGER DEFAULT 0,
    total_chat_messages INTEGER DEFAULT 0,
    avg_engagement_score DECIMAL(3,2) DEFAULT 0,
    last_session_at TIMESTAMPTZ,
    streak_days INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SESSION RECORDINGS
CREATE TABLE IF NOT EXISTS public.session_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,           -- Supabase Storage path
    file_size BIGINT DEFAULT 0,          -- bytes
    duration_seconds INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing'
        CHECK (status IN ('processing', 'ready', 'failed', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.content_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_content ON public.content_reports(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.content_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_session_analytics_session ON public.session_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_analytics_user ON public.session_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_stats_user ON public.user_learning_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_session ON public.session_recordings(session_id);

-- ==============================================================================
-- ENABLE RLS
-- ==============================================================================
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_learning_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_recordings ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- CONTENT REPORTS
CREATE POLICY "Users create reports" ON public.content_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users view own reports" ON public.content_reports
    FOR SELECT USING (auth.uid() = reporter_id);
-- Admin policies handled via supabaseAdmin in code

-- SESSION ANALYTICS
CREATE POLICY "Users view own analytics" ON public.session_analytics
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own analytics" ON public.session_analytics
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own analytics" ON public.session_analytics
    FOR UPDATE USING (auth.uid() = user_id);

-- USER LEARNING STATS
CREATE POLICY "Users view own stats" ON public.user_learning_stats
    FOR SELECT USING (auth.uid() = user_id);

-- SESSION RECORDINGS
CREATE POLICY "Anyone can view recordings" ON public.session_recordings
    FOR SELECT USING (true);
CREATE POLICY "Teachers manage recordings" ON public.session_recordings
    FOR ALL USING (auth.uid() = recorded_by);

-- ==============================================================================
-- TRIGGERS
-- ==============================================================================
CREATE TRIGGER update_content_reports_updated_at
    BEFORE UPDATE ON public.content_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_learning_stats_updated_at
    BEFORE UPDATE ON public.user_learning_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_recordings_updated_at
    BEFORE UPDATE ON public.session_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- DONE! Phase 5 tables created.
-- ==============================================================================
