-- ==============================================================================
-- PHASE 6: FEED ENHANCEMENT SCHEMA
-- ==============================================================================
-- HƯỚNG DẪN: Vào Supabase SQL Editor → Paste → Run
-- LƯU Ý: Script này chỉ BỔ SUNG cột mới cho bảng posts và tạo bảng mới.
--         Không xóa dữ liệu cũ, không thay đổi cấu trúc hiện tại.
-- ==============================================================================

-- ============================================================================
-- 1. MỞ RỘNG BẢNG POSTS (Thêm cột metadata cho feed đa dạng)
-- ============================================================================

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS title VARCHAR(200),
    ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS location VARCHAR(100),
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS duration INTEGER,
    ADD COLUMN IF NOT EXISTS related_piano_id INTEGER REFERENCES public.pianos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- ============================================================================
-- 2. BẢNG POST_VIEWS (Đếm lượt xem duy nhất, chống spam)
-- ============================================================================
-- Mỗi user chỉ được tính 1 view/bài viết.
-- Anonymous fallback bằng IP (qua cột viewer_ip khi viewer_id = NULL).
-- Trigger sẽ tự cập nhật views_count trên bảng posts.

CREATE TABLE IF NOT EXISTS public.post_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    viewer_ip VARCHAR(45),
    viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraints: Mỗi user đăng nhập chỉ 1 view/bài
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_views_unique_user
    ON public.post_views(post_id, viewer_id)
    WHERE viewer_id IS NOT NULL;

-- Unique constraints: Mỗi IP anonymous chỉ 1 view/bài
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_views_unique_ip
    ON public.post_views(post_id, viewer_ip)
    WHERE viewer_id IS NULL AND viewer_ip IS NOT NULL;

-- ============================================================================
-- 3. BẢNG HASHTAGS (Trending & Search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hashtags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    posts_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- Posts: tìm kiếm theo hashtags (GIN cho array search)
CREATE INDEX IF NOT EXISTS idx_posts_hashtags ON public.posts USING GIN(hashtags);

-- Posts: sắp xếp theo views cho feed algorithm tương lai
CREATE INDEX IF NOT EXISTS idx_posts_views_count ON public.posts(views_count DESC);

-- Posts: filter theo media_type (video/image/none)
CREATE INDEX IF NOT EXISTS idx_posts_media_type ON public.posts(media_type);

-- Posts: tìm bài viết liên kết với piano
CREATE INDEX IF NOT EXISTS idx_posts_related_piano ON public.posts(related_piano_id)
    WHERE related_piano_id IS NOT NULL;

-- Hashtags: tìm kiếm tên
CREATE INDEX IF NOT EXISTS idx_hashtags_name ON public.hashtags(name);

-- Hashtags: sắp xếp trending
CREATE INDEX IF NOT EXISTS idx_hashtags_trending ON public.hashtags(posts_count DESC);

-- Post views: lookup nhanh theo post
CREATE INDEX IF NOT EXISTS idx_post_views_post ON public.post_views(post_id);

-- Post views: lookup nhanh theo viewer
CREATE INDEX IF NOT EXISTS idx_post_views_viewer ON public.post_views(viewer_id)
    WHERE viewer_id IS NOT NULL;

-- ============================================================================
-- 5. ENABLE RLS
-- ============================================================================

ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

-- HASHTAGS: Ai cũng có thể đọc (công khai)
CREATE POLICY "Public view hashtags" ON public.hashtags
    FOR SELECT USING (true);

-- POST VIEWS: Ai cũng có thể đọc (số views là công khai)
CREATE POLICY "Public read views" ON public.post_views
    FOR SELECT USING (true);

-- POST VIEWS: Service role sẽ INSERT qua supabaseAdmin (không cần policy INSERT cho client)
-- Backend Express dùng service role key nên bypass RLS khi insert.

-- ============================================================================
-- 7. TRIGGER: Tự cập nhật views_count trên posts khi có view mới
-- ============================================================================

CREATE OR REPLACE FUNCTION update_post_views_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.posts
    SET views_count = (
        SELECT COUNT(*) FROM public.post_views WHERE post_id = NEW.post_id
    )
    WHERE id = NEW.post_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_view_insert ON public.post_views;
CREATE TRIGGER on_post_view_insert
    AFTER INSERT ON public.post_views
    FOR EACH ROW EXECUTE FUNCTION update_post_views_count();

-- ============================================================================
-- 8. FUNCTION: Sync hashtags khi tạo/sửa bài viết
-- ============================================================================
-- Khi bài viết có hashtags, tự động upsert vào bảng hashtags
-- và cập nhật posts_count.

CREATE OR REPLACE FUNCTION sync_post_hashtags()
RETURNS TRIGGER AS $$
DECLARE
    tag TEXT;
BEGIN
    -- Nếu có hashtags mới
    IF NEW.hashtags IS NOT NULL AND array_length(NEW.hashtags, 1) > 0 THEN
        FOREACH tag IN ARRAY NEW.hashtags
        LOOP
            -- Upsert hashtag: tạo mới nếu chưa có
            INSERT INTO public.hashtags (name, posts_count)
            VALUES (LOWER(TRIM(tag)), 1)
            ON CONFLICT (name) DO UPDATE
            SET posts_count = (
                SELECT COUNT(*) FROM public.posts
                WHERE LOWER(TRIM(tag)) = ANY(
                    SELECT LOWER(UNNEST(hashtags)) FROM public.posts
                    WHERE hashtags IS NOT NULL AND id != COALESCE(OLD.id, '00000000-0000-0000-0000-000000000000'::uuid)
                ) 
            ) + 1;
        END LOOP;
    END IF;

    -- Nếu có hashtags cũ bị xóa (khi UPDATE)
    IF TG_OP = 'UPDATE' AND OLD.hashtags IS NOT NULL AND array_length(OLD.hashtags, 1) > 0 THEN
        FOREACH tag IN ARRAY OLD.hashtags
        LOOP
            IF NOT (LOWER(TRIM(tag)) = ANY(
                SELECT LOWER(UNNEST(COALESCE(NEW.hashtags, '{}'::TEXT[])))
            )) THEN
                -- Tag bị xóa khỏi bài viết, giảm count
                UPDATE public.hashtags
                SET posts_count = GREATEST(posts_count - 1, 0)
                WHERE name = LOWER(TRIM(tag));
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_hashtags_change ON public.posts;
CREATE TRIGGER on_post_hashtags_change
    AFTER INSERT OR UPDATE OF hashtags ON public.posts
    FOR EACH ROW EXECUTE FUNCTION sync_post_hashtags();

-- Giảm posts_count khi xóa bài viết có hashtags
CREATE OR REPLACE FUNCTION on_post_delete_sync_hashtags()
RETURNS TRIGGER AS $$
DECLARE
    tag TEXT;
BEGIN
    IF OLD.hashtags IS NOT NULL AND array_length(OLD.hashtags, 1) > 0 THEN
        FOREACH tag IN ARRAY OLD.hashtags
        LOOP
            UPDATE public.hashtags
            SET posts_count = GREATEST(posts_count - 1, 0)
            WHERE name = LOWER(TRIM(tag));
        END LOOP;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_delete_hashtags ON public.posts;
CREATE TRIGGER on_post_delete_hashtags
    BEFORE DELETE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION on_post_delete_sync_hashtags();

-- ==============================================================================
-- DONE! Phase 6 Feed Enhancement tables created.
-- ==============================================================================
