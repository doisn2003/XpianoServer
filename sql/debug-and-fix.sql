-- =====================================================
-- QUICK DEBUG & FIX SCRIPT
-- Run this in Supabase SQL Editor to diagnose issues
-- =====================================================

-- 1. CHECK: Tables exist?
-- =====================================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND columns.table_name = tables.table_name) as column_count
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
  AND table_name IN ('profiles', 'pianos', 'favorites', 'orders', 'rentals')
ORDER BY table_name;

-- Expected: 5 rows (all tables)


-- 2. CHECK: Sample data exists?
-- =====================================================
SELECT 
  'profiles' as table_name, COUNT(*) as row_count FROM profiles
UNION ALL
SELECT 'pianos', COUNT(*) FROM pianos
UNION ALL
SELECT 'favorites', COUNT(*) FROM favorites
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'rentals', COUNT(*) FROM rentals;

-- Expected: pianos should have 3+ rows


-- 3. CHECK: RLS enabled?
-- =====================================================
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'pianos', 'favorites', 'orders', 'rentals')
ORDER BY tablename;

-- Expected: All should be 't' (true)


-- 4. CHECK: Public piano view policy exists?
-- =====================================================
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'pianos'
  AND policyname = 'public_view_pianos';

-- Expected: 1 row


-- 5. CHECK: Trigger exists?
-- =====================================================
SELECT 
  trigger_name,
  event_object_schema,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Expected: 1 row (trigger on auth.users)


-- 6. IF NO TRIGGER: Create it
-- =====================================================
-- Uncomment to run:
/*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
*/


-- 7. IF NO PIANOS: Insert sample data
-- =====================================================
-- Uncomment to run:
/*
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
  )
ON CONFLICT DO NOTHING;
*/


-- 8. TEST: Can anonymous user read pianos?
-- =====================================================
-- This simulates what your frontend does
SELECT id, name, category, price_per_hour 
FROM pianos 
LIMIT 3;

-- If this works → RLS policies OK
-- If error → RLS blocking


-- 9. CHECK: All RLS policies
-- =====================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  CASE 
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING clause'
  END as using_check,
  CASE 
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
    ELSE 'No WITH CHECK clause'
  END as with_check_check
FROM pg_policies
WHERE tablename IN ('profiles', 'pianos', 'favorites', 'orders', 'rentals')
ORDER BY tablename, policyname;


-- =====================================================
-- SUMMARY
-- =====================================================
-- Run queries 1-5 to check status
-- If anything missing:
--   - Uncomment section 6 (trigger)
--   - Uncomment section 7 (sample data)
-- Run query 8 to test if frontend will work
-- =====================================================
