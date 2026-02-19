-- ==============================================================================
-- MASTER SETUP SCRIPT v4 (COMPREHENSIVE FIX)
-- ==============================================================================
-- HƯỚNG DẪN:
-- 1. Vào Supabase SQL Editor.
-- 2. Paste toàn bộ và Run.
-- LƯU Ý: Script này sẽ XÓA SẠCH dữ liệu cũ để tạo lại cấu trúc chuẩn nhất.
-- ==============================================================================

-- 0. CLEANUP (DANGER ZONE)
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- 1. SETUP EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABLES DEFINITIONS
-- ==============================================================================

-- 2.1 PROFILES
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'teacher', 'warehouse_owner')),
  avatar_url TEXT,
  date_of_birth DATE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 PIANOS (Marketplace)
CREATE TABLE public.pianos (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  image_url TEXT,
  category TEXT, -- 'Grand', 'Upright', 'Digital'
  price_per_day BIGINT, -- Giá thuê theo ngày (NULL nếu chỉ bán)
  price BIGINT, -- Giá bán (NULL nếu chỉ cho thuê)
  rating DECIMAL(2,1) DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 0,
  description TEXT,
  features TEXT[] -- Array of strings
);

-- 2.3 TEACHER PROFILES (Hồ sơ giáo viên)
CREATE TABLE public.teacher_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    specializations TEXT,
    years_experience INTEGER,
    bio TEXT,
    
    -- Teaching modes
    teach_online BOOLEAN DEFAULT false,
    teach_offline BOOLEAN DEFAULT false,
    locations TEXT[],
    
    -- Pricing
    price_online BIGINT DEFAULT 0,
    price_offline BIGINT DEFAULT 0,
    
    -- Bundles
    bundle_8_sessions INTEGER DEFAULT 8,
    bundle_8_discount TEXT,
    bundle_12_sessions INTEGER DEFAULT 12,
    bundle_12_discount TEXT,
    
    allow_trial_lesson BOOLEAN DEFAULT false,
    
    -- Verification Docs
    id_number TEXT,
    id_front_url TEXT,
    id_back_url TEXT,
    certificates_description TEXT,
    certificate_urls TEXT[],
    
    -- Banking
    bank_name TEXT,
    bank_account TEXT,
    account_holder TEXT,
    
    -- Media
    avatar_url TEXT,
    video_demo_url TEXT,
    
    -- Status
    verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    rejected_reason TEXT,
    approved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2.4 FAVORITES (No changes needed)
CREATE TABLE public.favorites (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, piano_id)
);

-- 2.5 ORDERS
CREATE TABLE public.orders (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'rent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled', 'payment_failed')),
  total_price BIGINT NOT NULL, -- Changed to BIGINT
  rental_start_date DATE,
  rental_end_date DATE,
  rental_days INTEGER,
  admin_notes TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Payment
  payment_method TEXT DEFAULT 'COD' CHECK (payment_method IN ('COD', 'QR')),
  transaction_code TEXT,
  payment_expired_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 RENTALS
CREATE TABLE public.rentals (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE SET NULL NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'overdue')),
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 COURSES
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(15, 2) NOT NULL DEFAULT 0, -- Increased precision
    duration_weeks INTEGER NOT NULL DEFAULT 8,
    sessions_per_week INTEGER NOT NULL DEFAULT 2,
    max_students INTEGER NOT NULL DEFAULT 10,
    current_students INTEGER NOT NULL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    is_online BOOLEAN NOT NULL DEFAULT true,
    location VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.8 COURSE ENROLLMENTS
CREATE TABLE public.course_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0, -- Increased precision
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
    payment_method VARCHAR(100),
    payment_date TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    completed_sessions INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(course_id, student_id)
);

-- 2.9 VERIFICATION CODES
CREATE TABLE public.verification_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL, 
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, type)
);

-- ==============================================================================
-- 3. ENABLE RLS
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pianos ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. RLS POLICIES
-- ==============================================================================

-- 4.1 PROFILES
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 4.2 PIANOS
CREATE POLICY "Public view pianos" ON pianos FOR SELECT USING (true);
CREATE POLICY "Admins manage pianos" ON pianos FOR ALL USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));

-- 4.3 TEACHER PROFILES
CREATE POLICY "Teachers manage own profile" ON teacher_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins manage teacher profiles" ON teacher_profiles FOR ALL USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Public view approved teachers" ON teacher_profiles FOR SELECT USING (verification_status = 'approved');

-- 4.4 FAVORITES
CREATE POLICY "Users manage favorites" ON favorites FOR ALL USING (auth.uid() = user_id);

-- 4.5 ORDERS
CREATE POLICY "Users view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users cancel own orders" ON orders FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins manage orders" ON orders FOR ALL USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));

-- 4.6 RENTALS
CREATE POLICY "Users view own rentals" ON rentals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage rentals" ON rentals FOR ALL USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));

-- 4.7 COURSES
CREATE POLICY "Teachers manage own courses" ON courses FOR ALL USING (teacher_id = auth.uid());
CREATE POLICY "Public view active courses" ON courses FOR SELECT USING (status = 'active');
CREATE POLICY "Admins manage courses" ON courses FOR ALL USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.8 ENROLLMENTS
CREATE POLICY "Students manage own enrollments" ON course_enrollments FOR ALL USING (student_id = auth.uid());
CREATE POLICY "Teachers view course enrollments" ON course_enrollments FOR SELECT USING 
  (EXISTS (SELECT 1 FROM courses WHERE courses.id = course_enrollments.course_id AND courses.teacher_id = auth.uid()));
CREATE POLICY "Admins manage enrollments" ON course_enrollments FOR ALL USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ==============================================================================
-- 5. FUNCTION & TRIGGERS
-- ==============================================================================

-- 5.1 Auto-create Profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, phone, avatar_url, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.2 Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rentals_updated_at BEFORE UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teacher_profiles_updated_at BEFORE UPDATE ON teacher_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5.3 Auto-create Rental
CREATE OR REPLACE FUNCTION create_rental_on_approve()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'rent' AND NEW.status = 'approved' AND OLD.status = 'pending' THEN
    INSERT INTO rentals (
      order_id, user_id, piano_id, start_date, end_date, days, status
    ) VALUES (
      NEW.id, NEW.user_id, NEW.piano_id, NEW.rental_start_date, NEW.rental_end_date, NEW.rental_days, 'active'
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_approved AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION create_rental_on_approve();

-- ==============================================================================
-- 6. SAMPLE DATA
-- ==============================================================================
INSERT INTO pianos (name, image_url, category, price_per_day, price, rating, reviews_count, description, features)
VALUES 
  ('Yamaha C3X Grand', 'https://images.unsplash.com/photo-1552422535-c45813c61732', 'Grand', 2500000, 850000000, 4.9, 128, 'Dòng đàn Grand Piano tiêu chuẩn thế giới', ARRAY['Âm thanh vòm', 'Phím ngà voi nhân tạo', 'Phòng cách âm VIP']),
  ('Steinway Model D', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64', 'Grand', 5000000, 4500000000, 5.0, 256, 'Đàn piano concert grand đẳng cấp thế giới', ARRAY['Concert Grand 274cm', 'Handcrafted in Germany']),
  ('Kawai K-300', 'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe', 'Upright', 1800000, 150000000, 4.7, 142, 'Đàn piano đứng Nhật Bản chất lượng cao', ARRAY['Chiều cao 122cm', 'Millennium III Action']),
  ('Roland FP-90X', 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c', 'Digital', 800000, 45000000, 4.6, 98, 'Đàn piano điện tử cao cấp', ARRAY['88 phím PHA-50', 'Bluetooth Audio/MIDI'])
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- DONE!
-- ==============================================================================
