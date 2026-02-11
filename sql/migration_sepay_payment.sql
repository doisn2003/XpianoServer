-- =====================================================
-- SEPAY PAYMENT INTEGRATION - MIGRATION
-- Thêm cột payment_method và transaction_code cho bảng orders
-- =====================================================

-- 1. Thêm cột payment_method (COD = Thanh toán khi nhận, QR = VietQR/SePay)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'COD' 
CHECK (payment_method IN ('COD', 'QR'));

-- 2. Thêm cột transaction_code để lưu mã giao dịch ngân hàng
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS transaction_code TEXT;

-- 3. Thêm cột payment_expired_at để lưu thời điểm hết hạn thanh toán QR
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_expired_at TIMESTAMPTZ;

-- 4. Thêm cột paid_at để lưu thời điểm thanh toán thành công
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 5. Index cho performance khi query pending QR orders
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_pending_qr ON orders(status, payment_method, created_at) 
WHERE status = 'pending' AND payment_method = 'QR';

-- 6. Comment cho documentation
COMMENT ON COLUMN orders.payment_method IS 'Phương thức thanh toán: COD (khi nhận hàng), QR (chuyển khoản VietQR)';
COMMENT ON COLUMN orders.transaction_code IS 'Mã giao dịch ngân hàng (từ SePay webhook)';
COMMENT ON COLUMN orders.payment_expired_at IS 'Thời điểm hết hạn thanh toán QR (60 phút từ created_at)';
COMMENT ON COLUMN orders.paid_at IS 'Thời điểm thanh toán thành công';

-- =====================================================
-- HƯỚNG DẪN CHẠY:
-- 1. Vào Supabase Dashboard > SQL Editor
-- 2. Copy và paste đoạn SQL này
-- 3. Click "RUN"
-- =====================================================
