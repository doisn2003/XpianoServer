-- Kịch bản SQL để cập nhật Schema cho nghiệp vụ Khóa học Piano
-- Dành cho Supabase PostgreSQL

-- 1. Bảng courses (cập nhật hoặc tạo mới)
-- DROP TABLE IF EXISTS public.courses CASCADE;
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    duration_weeks INT DEFAULT 4,
    sessions_per_week INT DEFAULT 2,
    max_students INT DEFAULT 10,
    start_date DATE,
    schedule JSONB, -- Lưu trữ cấu trúc [{day_of_week: 3, time: "20:00"}]
    thumbnail_url TEXT,
    status TEXT DEFAULT 'draft', -- 'draft', 'published', 'completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Bảng course_enrollments
-- Chứa học viên đã mua khóa học thành công
DROP TABLE IF EXISTS public.course_enrollments CASCADE;
CREATE TABLE public.course_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id INT REFERENCES public.orders(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active', -- 'active', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id, user_id)
);

-- 3. Cập nhật bảng live_sessions (nếu chưa có cột course_id)
ALTER TABLE public.live_sessions 
ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE;

-- 4. Bổ sung loại đơn hàng trong comments nếu cần, đơn hàng type = 'course'.
-- Không cần schema change cho orders vì type là TEXT. Bổ sung course_id vào orders để dễ tra cứu.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;
