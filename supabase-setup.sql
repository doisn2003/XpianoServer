-- ============================================
-- SUPABASE SETUP SCRIPT
-- Chạy script này trong Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. PROFILES TABLE (User metadata)
-- ============================================
-- Supabase đã có auth.users, ta tạo profiles để lưu thêm info

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'teacher')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. AUTO-CREATE PROFILE TRIGGER
-- ============================================
-- Tự động tạo profile khi user đăng ký

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. PIANOS TABLE
-- ============================================
-- Giống backend Express

CREATE TABLE IF NOT EXISTS pianos (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  price_per_hour INTEGER,
  rating DECIMAL(2,1),
  reviews_count INTEGER DEFAULT 0,
  description TEXT,
  features TEXT[]
);

-- ============================================
-- 4. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pianos_category ON pianos(category);
CREATE INDEX IF NOT EXISTS idx_pianos_rating ON pianos(rating);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pianos ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. RLS POLICIES - PROFILES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Anyone can view their own profile
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admins can update all profiles (including role change)
CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Admins can delete users
CREATE POLICY "Admins can delete profiles"
ON profiles FOR DELETE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- 7. RLS POLICIES - PIANOS
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view pianos" ON pianos;
DROP POLICY IF EXISTS "Authenticated users can create pianos" ON pianos;
DROP POLICY IF EXISTS "Admins can update pianos" ON pianos;
DROP POLICY IF EXISTS "Admins can delete pianos" ON pianos;

-- Anyone can view pianos (even not logged in)
CREATE POLICY "Anyone can view pianos"
ON pianos FOR SELECT
USING (true);

-- Only authenticated users can create pianos
-- (Có thể thay đổi thành chỉ admin)
CREATE POLICY "Authenticated users can create pianos"
ON pianos FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Only admins can update pianos
CREATE POLICY "Admins can update pianos"
ON pianos FOR UPDATE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Only admins can delete pianos
CREATE POLICY "Admins can delete pianos"
ON pianos FOR DELETE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- 8. INSERT SAMPLE DATA
-- ============================================

-- Sample admin user (phải tạo qua Supabase Auth, không thể insert trực tiếp)
-- Sau khi đăng ký user qua app, update role:
-- UPDATE profiles SET role = 'admin' WHERE id = 'user-uuid-here';

-- Sample pianos
INSERT INTO pianos (name, image_url, category, price_per_hour, rating, reviews_count, description, features)
VALUES 
  (
    'Yamaha C3X Grand',
    'https://images.unsplash.com/photo-1552422535-c45813c61732?q=80&w=1000',
    'Grand',
    250000,
    4.9,
    128,
    'Dòng đàn Grand Piano tiêu chuẩn thế giới cho âm thanh vang, sáng và cảm giác phím tuyệt vời.',
    ARRAY['Âm thanh vòm', 'Phím ngà voi nhân tạo', 'Phòng cách âm VIP']
  ),
  (
    'Steinway Model D Concert Grand',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=1000',
    'Grand',
    500000,
    5.0,
    256,
    'Đàn piano concert grand đẳng cấp thế giới, được sử dụng trong các buổi hòa nhạc chuyên nghiệp.',
    ARRAY['Concert Grand 274cm', 'Âm thanh đỉnh cao', 'Handcrafted in Germany', 'Phòng thu chuyên nghiệp']
  ),
  (
    'Kawai K-300 Upright',
    'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe?q=80&w=1000',
    'Upright',
    180000,
    4.7,
    142,
    'Đàn piano đứng Nhật Bản chất lượng cao, phù hợp cho gia đình và học viên.',
    ARRAY['Chiều cao 122cm', 'Millennium III Action', 'Âm thanh rõ ràng', 'Tiết kiệm không gian']
  ),
  (
    'Roland FP-90X Digital',
    'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?q=80&w=1000',
    'Digital',
    120000,
    4.6,
    98,
    'Đàn piano điện tử cao cấp với công nghệ mô phỏng âm thanh tiên tiến.',
    ARRAY['88 phím PHA-50', 'Bluetooth Audio/MIDI', 'SuperNATURAL Piano', 'Portable']
  ),
  (
    'Yamaha U1 Upright',
    'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?q=80&w=1000',
    'Upright',
    200000,
    4.8,
    187,
    'Mẫu đàn upright kinh điển, bền bỉ và âm thanh ổn định qua thời gian.',
    ARRAY['Chiều cao 121cm', 'Độ bền cao', 'Bảo trì dễ dàng', 'Giá trị lâu dài']
  ),
  (
    'Casio Privia PX-S3100',
    'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?q=80&w=1000',
    'Digital',
    90000,
    4.4,
    76,
    'Đàn piano điện tử siêu mỏng, phù hợp cho người mới bắt đầu và không gian nhỏ.',
    ARRAY['Thiết kế siêu mỏng', '88 phím Smart Scaled', 'Loa tích hợp', 'USB Audio/MIDI', 'Giá cả phải chăng']
  )
ON CONFLICT DO NOTHING;

-- ============================================
-- 9. HELPER FUNCTIONS
-- ============================================

-- Function to get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. REALTIME SETUP (Optional)
-- ============================================

-- Enable realtime for pianos table
-- Chạy trong Supabase Dashboard: Database → Replication
-- Hoặc dùng SQL:

ALTER PUBLICATION supabase_realtime ADD TABLE pianos;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ============================================
-- DONE! ✅
-- ============================================

-- Test queries:
-- SELECT * FROM pianos;
-- SELECT * FROM profiles;
-- SELECT get_my_role();
-- SELECT is_admin();

-- Tạo admin user:
-- 1. Đăng ký user qua app/website
-- 2. Lấy user ID từ auth.users
-- 3. UPDATE profiles SET role = 'admin' WHERE id = 'user-uuid';
