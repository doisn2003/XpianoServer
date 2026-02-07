-- =====================================================
-- XPIANO CORE FEATURES - DATABASE SCHEMA
-- =====================================================

-- 1. FAVORITES TABLE (Thả tim - Danh sách yêu thích)
-- =====================================================
CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, piano_id) -- Mỗi user chỉ thả tim 1 lần cho 1 piano
);

-- Enable RLS
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only manage own favorites
CREATE POLICY "users_view_own_favorites"
ON favorites FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users_add_favorites"
ON favorites FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_remove_favorites"
ON favorites FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "admin_view_all_favorites"
ON favorites FOR SELECT
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Index for performance
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_piano_id ON favorites(piano_id);


-- 2. ORDERS TABLE (Đơn hàng - Mua/Mượn)
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE SET NULL,
  
  -- Order type
  type TEXT NOT NULL CHECK (type IN ('buy', 'rent')),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  
  -- Pricing
  total_price INTEGER NOT NULL,
  
  -- Rental specific (NULL for 'buy' orders)
  rental_start_date DATE,
  rental_end_date DATE,
  rental_days INTEGER, -- Auto-calculated
  
  -- Admin notes
  admin_notes TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view own orders
CREATE POLICY "users_view_own_orders"
ON orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users_create_orders"
ON orders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_cancel_own_pending_orders"
ON orders FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (status IN ('pending', 'cancelled'));

-- Admins can view/manage all orders
CREATE POLICY "admin_view_all_orders"
ON orders FOR SELECT
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admin_manage_orders"
ON orders FOR UPDATE
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Index for performance
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_type ON orders(type);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);


-- 3. RENTALS TABLE (Chi tiết mượn đàn đang active)
-- =====================================================
CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  piano_id INTEGER REFERENCES pianos(id) ON DELETE SET NULL NOT NULL,
  
  -- Rental period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'overdue')),
  
  -- Return info
  returned_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view own rentals
CREATE POLICY "users_view_own_rentals"
ON rentals FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view/manage all
CREATE POLICY "admin_view_all_rentals"
ON rentals FOR SELECT
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "admin_manage_rentals"
ON rentals FOR UPDATE
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Index
CREATE INDEX idx_rentals_user_id ON rentals(user_id);
CREATE INDEX idx_rentals_status ON rentals(status);
CREATE INDEX idx_rentals_end_date ON rentals(end_date);


-- 4. FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for orders
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for rentals
CREATE TRIGGER update_rentals_updated_at
BEFORE UPDATE ON rentals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- Auto-create rental when order is approved (for rent type)
CREATE OR REPLACE FUNCTION create_rental_on_approve()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for rent orders that are newly approved
  IF NEW.type = 'rent' AND NEW.status = 'approved' AND OLD.status = 'pending' THEN
    INSERT INTO rentals (
      order_id,
      user_id,
      piano_id,
      start_date,
      end_date,
      days,
      status
    ) VALUES (
      NEW.id,
      NEW.user_id,
      NEW.piano_id,
      NEW.rental_start_date,
      NEW.rental_end_date,
      NEW.rental_days,
      'active'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_approved
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION create_rental_on_approve();


-- 5. HELPER VIEWS (Optional - for easier queries)
-- =====================================================

-- View: Orders with user and piano details
CREATE OR REPLACE VIEW orders_detailed AS
SELECT 
  o.*,
  p.full_name as user_name,
  p.email as user_email,
  pi.name as piano_name,
  pi.category as piano_category,
  pi.image_url as piano_image
FROM orders o
LEFT JOIN profiles p ON o.user_id = p.id
LEFT JOIN pianos pi ON o.piano_id = pi.id;

-- View: Active rentals with details
CREATE OR REPLACE VIEW active_rentals AS
SELECT 
  r.*,
  p.full_name as user_name,
  pi.name as piano_name,
  pi.image_url as piano_image,
  (r.end_date - CURRENT_DATE) as days_remaining
FROM rentals r
JOIN profiles p ON r.user_id = p.id
LEFT JOIN pianos pi ON r.piano_id = pi.id
WHERE r.status = 'active';


-- 6. SAMPLE DATA (Optional - for testing)
-- =====================================================

-- You can insert sample favorites, orders, rentals here for testing
-- Example:
-- INSERT INTO favorites (user_id, piano_id) VALUES 
--   ('user-uuid-1', 1),
--   ('user-uuid-1', 3);

-- INSERT INTO orders (user_id, piano_id, type, total_price, status) VALUES
--   ('user-uuid-1', 1, 'buy', 50000000, 'approved'),
--   ('user-uuid-1', 2, 'rent', 300000, 'pending', '2026-02-10', '2026-02-12', 2);


-- =====================================================
-- SUMMARY
-- =====================================================
-- Tables created:
-- 1. favorites (user_id, piano_id)
-- 2. orders (type: buy/rent, status, pricing, rental dates)
-- 3. rentals (active rentals tracking)
-- 
-- RLS Policies: ✅ Enabled
-- Triggers: ✅ Auto-update timestamps, auto-create rentals
-- Views: ✅ orders_detailed, active_rentals
-- =====================================================
