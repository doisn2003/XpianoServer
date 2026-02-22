-- ==============================================================================
-- MASTER SETUP SCRIPT v3 (FINAL CHECKED)
-- ==============================================================================
-- HƯỚNG DẪN:
-- 1. Tạo project mới trên Supabase.
-- 2. Vào SQL Editor -> New Query.
-- 3. Copy toàn bộ nội dung file này và Paste vào.
-- 4. Bấm RUN.
-- ==============================================================================

-- 1. SETUP EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABLES DEFINITIONS
-- ==============================================================================

-- 2.1 PROFILES (User metadata linked to auth.users)
-- Updated: Added 'warehouse_owner' to role check
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'teacher', 'warehouse_owner')),
  avatar_url TEXT,
  date_of_birth DATE, -- Added as per code usage
  email TEXT, -- Added for consistency/caching
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 PIANOS (Marketplace Items)
CREATE TABLE IF NOT EXISTS public.pianos (
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

-- 2.3 FAVORITES (User wishlist)
CREATE TABLE IF NOT EXISTS public.favorites (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, piano_id)
);

-- 2.4 ORDERS (Buy/Rent Requests)
CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'rent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  total_price INTEGER NOT NULL,
  rental_start_date DATE,
  rental_end_date DATE,
  rental_days INTEGER,
  admin_notes TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Payment Integration Columns
  payment_method TEXT DEFAULT 'COD' CHECK (payment_method IN ('COD', 'QR')),
  transaction_code TEXT,
  payment_expired_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5 RENTALS (Active Rentals Tracking)
CREATE TABLE IF NOT EXISTS public.rentals (
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

-- 2.6 VERIFICATION CODES (For Email Verification)
CREATE TABLE IF NOT EXISTS public.verification_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL, 
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, type)
);

-- 2.7 COURSES (For Teachers)
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
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

-- 2.8 COURSE ENROLLMENTS (Students in Courses)
CREATE TABLE IF NOT EXISTS public.course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
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

-- ==============================================================================
-- 3. ENABLE RLS
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pianos ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. RLS POLICIES
-- ==============================================================================

-- 4.1 PROFILES POLICIES
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
-- Warehouse Owner is treated similar to Admin for viewing? Let's allow admins to see everything.
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 4.2 PIANOS POLICIES
CREATE POLICY "Anyone can view pianos" ON pianos FOR SELECT USING (true);
CREATE POLICY "Admins/Owners can insert pianos" ON pianos FOR INSERT WITH CHECK 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));
CREATE POLICY "Admins/Owners can update pianos" ON pianos FOR UPDATE USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));
CREATE POLICY "Admins/Owners can delete pianos" ON pianos FOR DELETE USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));

-- 4.3 FAVORITES POLICIES
CREATE POLICY "Users view own favorites" ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users add favorites" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove favorites" ON favorites FOR DELETE USING (auth.uid() = user_id);

-- 4.4 ORDERS POLICIES (Warehouse owner needs access too)
CREATE POLICY "Users view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users cancel own orders" ON orders FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins/Owners view all orders" ON orders FOR SELECT USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));
CREATE POLICY "Admins/Owners manage orders" ON orders FOR UPDATE USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));

-- 4.5 RENTALS POLICIES
CREATE POLICY "Users view own rentals" ON rentals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins/Owners view all rentals" ON rentals FOR SELECT USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));
CREATE POLICY "Admins/Owners manage rentals" ON rentals FOR UPDATE USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'warehouse_owner'));

-- 4.6 COURSES POLICIES
CREATE POLICY "Teachers view own courses" ON courses FOR SELECT USING (teacher_id = auth.uid());
CREATE POLICY "Teachers create courses" ON courses FOR INSERT WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Teachers update own courses" ON courses FOR UPDATE USING (teacher_id = auth.uid());
CREATE POLICY "Teachers delete own courses" ON courses FOR DELETE USING (teacher_id = auth.uid());
CREATE POLICY "Students view active courses" ON courses FOR SELECT USING (status = 'active');
CREATE POLICY "Admins view all courses" ON courses FOR SELECT USING 
  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'); -- Only full admin manages courses? Or Warehouse owner too? Let's stick to admin for now.

-- 4.7 ENROLLMENTS POLICIES
CREATE POLICY "Students view own enrollments" ON course_enrollments FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Teachers view own course enrollments" ON course_enrollments FOR SELECT USING (EXISTS (SELECT 1 FROM courses WHERE courses.id = course_enrollments.course_id AND courses.teacher_id = auth.uid()));
CREATE POLICY "Students enroll" ON course_enrollments FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "Admins view all enrollments" ON course_enrollments FOR SELECT USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ==============================================================================
-- 5. FUNCTION & TRIGGERS
-- ==============================================================================

-- 5.1 Auto-create Profile on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, phone, avatar_url, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'), -- Ensure role defaults to user if missing
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email -- Sync email specifically
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- 5.2 Helper: Update 'updated_at' timestamp
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

-- 5.3 Auto-create Rental record on Order Approval
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
INSERT INTO pianos (name, image_url, category, price_per_hour, rating, reviews_count, description, features)
VALUES 
  ('Yamaha C3X Grand', 'https://images.unsplash.com/photo-1552422535-c45813c61732', 'Grand', 250000, 4.9, 128, 'Dòng đàn Grand Piano tiêu chuẩn thế giới', ARRAY['Âm thanh vòm', 'Phím ngà voi nhân tạo', 'Phòng cách âm VIP']),
  ('Steinway Model D', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64', 'Grand', 500000, 5.0, 256, 'Đàn piano concert grand đẳng cấp thế giới', ARRAY['Concert Grand 274cm', 'Handcrafted in Germany']),
  ('Kawai K-300', 'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe', 'Upright', 180000, 4.7, 142, 'Đàn piano đứng Nhật Bản chất lượng cao', ARRAY['Chiều cao 122cm', 'Millennium III Action']),
  ('Roland FP-90X', 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c', 'Digital', 120000, 4.6, 98, 'Đàn piano điện tử cao cấp', ARRAY['88 phím PHA-50', 'Bluetooth Audio/MIDI'])
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- DONE!
-- ==============================================================================
