-- =====================================================
-- Courses & Enrollments Tables for Xpiano
-- Mobile & Web shared database schema
-- =====================================================

-- Table: courses
-- Stores information about courses created by teachers
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

-- Table: course_enrollments
-- Tracks student enrollments in courses
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON public.courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON public.course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_payment_status ON public.course_enrollments(payment_status);

-- Trigger to update updated_at on courses
CREATE OR REPLACE FUNCTION update_courses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_courses_updated_at
    BEFORE UPDATE ON public.courses
    FOR EACH ROW
    EXECUTE FUNCTION update_courses_updated_at();

-- Trigger to update updated_at on course_enrollments
CREATE OR REPLACE FUNCTION update_enrollments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enrollments_updated_at
    BEFORE UPDATE ON public.course_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_enrollments_updated_at();

-- Trigger to update current_students count when enrollment is added/removed
CREATE OR REPLACE FUNCTION update_course_student_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.courses 
        SET current_students = current_students + 1 
        WHERE id = NEW.course_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.courses 
        SET current_students = GREATEST(current_students - 1, 0)
        WHERE id = OLD.course_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_course_student_count
    AFTER INSERT OR DELETE ON public.course_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_course_student_count();

-- RLS Policies for courses
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Teachers can view and manage their own courses
CREATE POLICY "Teachers can view their own courses"
    ON public.courses FOR SELECT
    USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can create courses"
    ON public.courses FOR INSERT
    WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update their own courses"
    ON public.courses FOR UPDATE
    USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete their own courses"
    ON public.courses FOR DELETE
    USING (teacher_id = auth.uid());

-- Students can view active courses
CREATE POLICY "Students can view active courses"
    ON public.courses FOR SELECT
    USING (status = 'active');

-- Admins can view all courses
CREATE POLICY "Admins can view all courses"
    ON public.courses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- RLS Policies for course_enrollments
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

-- Students can view their own enrollments
CREATE POLICY "Students can view their own enrollments"
    ON public.course_enrollments FOR SELECT
    USING (student_id = auth.uid());

-- Teachers can view enrollments in their courses
CREATE POLICY "Teachers can view enrollments in their courses"
    ON public.course_enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE courses.id = course_enrollments.course_id 
            AND courses.teacher_id = auth.uid()
        )
    );

-- Students can enroll in courses
CREATE POLICY "Students can enroll in courses"
    ON public.course_enrollments FOR INSERT
    WITH CHECK (student_id = auth.uid());

-- Students can update their own enrollments
CREATE POLICY "Students can update their own enrollments"
    ON public.course_enrollments FOR UPDATE
    USING (student_id = auth.uid());

-- Admins can view all enrollments
CREATE POLICY "Admins can view all enrollments"
    ON public.course_enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_enrollments TO authenticated;

-- Insert sample data (optional - for testing)
-- Uncomment if you want to test with sample data
/*
INSERT INTO public.courses (teacher_id, title, description, price, duration_weeks, sessions_per_week, max_students, is_online, status)
SELECT 
    user_id,
    'Piano cơ bản cho người mới bắt đầu',
    'Khóa học dành cho người chưa biết gì về piano. Học từ cơ bản đến nâng cao trong 8 tuần.',
    2000000,
    8,
    2,
    10,
    true,
    'active'
FROM public.teacher_profiles
WHERE verification_status = 'approved'
LIMIT 1;
*/

COMMENT ON TABLE public.courses IS 'Stores courses created by approved teachers';
COMMENT ON TABLE public.course_enrollments IS 'Tracks student enrollments and payments for courses';
