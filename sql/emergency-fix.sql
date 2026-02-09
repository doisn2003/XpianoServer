-- =====================================================
-- EMERGENCY FIX - Run this NOW to fix connection
-- =====================================================

-- 1. DISABLE RLS temporarily to test if that's the issue
-- =====================================================
ALTER TABLE pianos DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 2. TEST: Can select pianos now?
-- =====================================================
SELECT COUNT(*) as piano_count FROM pianos;

-- If this returns a number → RLS was blocking
-- If still error → Different issue

-- 3. IF RLS WAS THE ISSUE: Re-enable and fix policies
-- =====================================================

-- Re-enable RLS
ALTER TABLE pianos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "public_view_pianos" ON pianos;
DROP POLICY IF EXISTS "admin_insert_pianos" ON pianos;
DROP POLICY IF EXISTS "admin_update_pianos" ON pianos;
DROP POLICY IF EXISTS "admin_delete_pianos" ON pianos;

-- Create new SIMPLE policies (less restrictive)
CREATE POLICY "anyone_can_view_pianos"
ON pianos FOR SELECT
TO PUBLIC
USING (true);

CREATE POLICY "admins_can_insert_pianos"
ON pianos FOR INSERT
TO authenticated
WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admins_can_update_pianos"
ON pianos FOR UPDATE
TO authenticated
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admins_can_delete_pianos"
ON pianos FOR DELETE
TO authenticated
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4. TEST AGAIN
-- =====================================================
SELECT id, name, category FROM pianos LIMIT 3;

-- 5. INSERT SAMPLE DATA if empty
-- =====================================================
INSERT INTO pianos (name, image_url, category, price_per_hour, rating, reviews_count, description, features)
VALUES 
  (
    'Yamaha C3X Grand',
    'https://images.unsplash.com/photo-1552422535-c45813c61732?q=80&w=1000',
    'Grand',
    250000,
    4.9,
    128,
    'Dòng đàn Grand Piano tiêu chuẩn thế giới',
    ARRAY['Âm thanh vòm', 'Phím ngà voi nhân tạo', 'Phòng cách âm VIP']
  ),
  (
    'Roland FP-90X Digital',
    'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?q=80&w=1000',
    'Digital',
    120000,
    4.6,
    98,
    'Đàn piano điện tử cao cấp',
    ARRAY['88 phím PHA-50', 'Bluetooth Audio/MIDI', 'SuperNATURAL Piano']
  ),
  (
    'Kawai K-300 Upright',
    'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe?q=80&w=1000',
    'Upright',
    180000,
    4.7,
    142,
    'Đàn piano đứng Nhật Bản chất lượng cao',
    ARRAY['Chiều cao 122cm', 'Millennium III Action', 'Âm thanh rõ ràng']
  ),
  (
    'Steinway Model D',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=1000',
    'Grand',
    500000,
    5.0,
    256,
    'Đàn piano concert grand đẳng cấp thế giới',
    ARRAY['Concert Grand 274cm', 'Âm thanh đỉnh cao', 'Handcrafted in Germany']
  )
ON CONFLICT DO NOTHING;

-- 6. VERIFY
-- =====================================================
SELECT 
  'Pianos' as table_name, 
  COUNT(*) as row_count,
  CASE WHEN tablename IS NOT NULL THEN 'RLS Enabled' ELSE 'RLS Disabled' END as rls_status
FROM pianos
CROSS JOIN (
  SELECT tablename FROM pg_tables 
  WHERE schemaname = 'public' 
    AND tablename = 'pianos' 
    AND rowsecurity = true
) as t
GROUP BY t.tablename;

-- =====================================================
-- EXPECTED RESULT:
-- Pianos | 4 | RLS Enabled
-- =====================================================

-- NOW TEST ON BROWSER:
-- Refresh page → Should see pianos grid!
-- =====================================================
