-- ==============================================================================
-- PHASE 4: MULTI-CAMERA & PIANO SPACE SCHEMA
-- ==============================================================================
-- HƯỚNG DẪN: Vào Supabase SQL Editor → Paste → Run
-- ==============================================================================

-- 1. SESSION TRACKS (Track metadata for multi-camera layout)
-- Stores what each track represents so frontend knows how to lay out video
CREATE TABLE IF NOT EXISTS public.session_tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    track_sid VARCHAR(100),              -- LiveKit track SID (set when track is published)
    track_source VARCHAR(30) NOT NULL    -- 'camera_face', 'camera_hands', 'screen_piano', 'audio', 'screen_share'
        CHECK (track_source IN ('camera_face', 'camera_hands', 'screen_piano',
                                 'audio', 'screen_share', 'camera', 'microphone')),
    label VARCHAR(100),                  -- Human-readable label e.g. "Webcam chính"
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',         -- { width, height, fps, bitrate, ... }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SESSION ROOM CONFIG (Per-session room permissions)
-- Store role-based track permissions per session
CREATE TABLE IF NOT EXISTS public.session_room_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE UNIQUE,
    teacher_config JSONB DEFAULT '{
        "max_video_tracks": 3,
        "max_audio_tracks": 1,
        "can_publish": true,
        "can_subscribe": true,
        "can_publish_data": true,
        "can_screen_share": true,
        "allowed_sources": ["camera_face", "camera_hands", "screen_piano", "audio"]
    }',
    student_config JSONB DEFAULT '{
        "max_video_tracks": 1,
        "max_audio_tracks": 1,
        "can_publish": false,
        "can_subscribe": true,
        "can_publish_data": true,
        "can_screen_share": false,
        "allowed_sources": ["camera", "microphone"]
    }',
    layout_preset VARCHAR(30) DEFAULT 'default'
        CHECK (layout_preset IN ('default', 'focus_hands', 'focus_face',
                                  'split_equal', 'picture_in_picture', 'custom')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_session_tracks_session ON public.session_tracks(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tracks_user ON public.session_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_session_room_config_session ON public.session_room_config(session_id);

-- ==============================================================================
-- ENABLE RLS
-- ==============================================================================
ALTER TABLE public.session_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_room_config ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- SESSION TRACKS
CREATE POLICY "Anyone can view tracks" ON public.session_tracks
    FOR SELECT USING (true);
CREATE POLICY "Track owner manages" ON public.session_tracks
    FOR ALL USING (auth.uid() = user_id);

-- SESSION ROOM CONFIG
CREATE POLICY "Anyone can view room config" ON public.session_room_config
    FOR SELECT USING (true);
CREATE POLICY "Teacher manages config" ON public.session_room_config
    FOR ALL USING (
        session_id IN (SELECT id FROM public.live_sessions WHERE teacher_id = auth.uid())
    );

-- ==============================================================================
-- TRIGGERS
-- ==============================================================================
CREATE TRIGGER update_session_tracks_updated_at
    BEFORE UPDATE ON public.session_tracks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_room_config_updated_at
    BEFORE UPDATE ON public.session_room_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- DONE! Phase 4 Multi-Camera & Piano Space tables created.
-- ==============================================================================
