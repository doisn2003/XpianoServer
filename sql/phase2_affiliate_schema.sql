-- ============================================================
-- PHASE 2: Affiliate System (Tiếp thị liên kết)
-- Liên kết với hệ thống Wallet & Transactions từ Phase 1
-- Run this in Supabase SQL Editor AFTER phase1_wallet_schema.sql
-- ============================================================

-- ============================================================
-- 1. BẢNG affiliates
-- Mỗi user đăng ký affiliate sẽ có 1 record duy nhất (unique user_id)
-- referral_code: mã giới thiệu duy nhất dạng "XPIANO_XXXXXX"
-- commission_rate: % hoa hồng, mặc định 10%
-- ============================================================
CREATE TABLE IF NOT EXISTS public.affiliates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
    referral_code   VARCHAR(50) NOT NULL UNIQUE,
    commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.10, -- 10% mặc định
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Chỉ các status hợp lệ
    CONSTRAINT affiliates_status_check CHECK (status IN ('active', 'banned')),
    -- commission_rate trong khoảng 0% - 100%
    CONSTRAINT affiliates_commission_rate_check CHECK (commission_rate >= 0 AND commission_rate <= 1)
);

-- ============================================================
-- 2. BẢNG commissions
-- Ghi nhận mỗi lần hoa hồng được tính cho affiliate
-- Lifecycle: pending -> approved | cancelled
-- ============================================================
CREATE TABLE IF NOT EXISTS public.commissions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id   UUID NOT NULL REFERENCES public.affiliates (id) ON DELETE CASCADE,
    amount         NUMERIC(15, 2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id   VARCHAR(255),   -- ID của order hoặc course
    status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    note           TEXT,
    approved_by    UUID REFERENCES public.profiles (id), -- Admin đã duyệt
    approved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Số tiền phải > 0
    CONSTRAINT commissions_amount_positive CHECK (amount > 0),
    -- Chỉ chấp nhận các status hợp lệ
    CONSTRAINT commissions_status_check CHECK (status IN ('pending', 'approved', 'cancelled')),
    -- reference_type hợp lệ
    CONSTRAINT commissions_reference_type_check CHECK (
        reference_type IN ('order_piano', 'course_fee')
    )
);

-- ============================================================
-- 3. INDEXES để tăng tốc query
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id       ON public.affiliates (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_referral_code ON public.affiliates (referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status        ON public.affiliates (status);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate_id ON public.commissions (affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status       ON public.commissions (status);
CREATE INDEX IF NOT EXISTS idx_commissions_reference    ON public.commissions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_commissions_created_at   ON public.commissions (created_at DESC);

-- ============================================================
-- 4. TRIGGER: auto updated_at cho affiliates và commissions
-- Tái sử dụng hàm update_wallet_updated_at() từ Phase 1
-- (đã tạo function chung, chỉ cần tạo trigger mới)
-- ============================================================
DROP TRIGGER IF EXISTS affiliates_updated_at ON public.affiliates;
CREATE TRIGGER affiliates_updated_at
    BEFORE UPDATE ON public.affiliates
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at(); -- Hàm dùng chung từ Phase 1

DROP TRIGGER IF EXISTS commissions_updated_at ON public.commissions;
CREATE TRIGGER commissions_updated_at
    BEFORE UPDATE ON public.commissions
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at();

-- ============================================================
-- 5. STORED PROCEDURE: approve_commission (ACID-safe)
--
-- Business Logic:
--   1. Lock commission row (tránh approve 2 lần đồng thời)
--   2. Kiểm tra commission tồn tại và đang 'pending'
--   3. Lấy thông tin affiliate → lấy user_id của affiliate
--   4. Lock ví Admin, kiểm tra balance đủ không
--   5. Lock ví Affiliate
--   6. Trừ available_balance của ví Admin (-amount)
--   7. Cộng available_balance của ví Affiliate (+amount)
--   8. Update commission status = 'approved'
--   9. Ghi 2 dòng transaction: OUT (Admin) + IN (Affiliate)
--   10. Nếu bất kỳ bước nào lỗi → toàn bộ ROLLBACK tự động
-- ============================================================
CREATE OR REPLACE FUNCTION approve_commission(
    p_commission_id  UUID,
    p_admin_user_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Bỏ qua RLS, đảm bảo quyền ghi vào tất cả bảng
AS $$
DECLARE
    v_commission     public.commissions%ROWTYPE;
    v_affiliate      public.affiliates%ROWTYPE;
    v_admin_wallet   public.wallets%ROWTYPE;
    v_affiliate_wallet public.wallets%ROWTYPE;
BEGIN
    -- =====================================================
    -- BƯỚC 1: Lock và đọc commission
    -- =====================================================
    SELECT * INTO v_commission
    FROM public.commissions
    WHERE id = p_commission_id
    FOR UPDATE; -- Lock row ngăn race condition

    -- Kiểm tra tồn tại
    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMMISSION_NOT_FOUND: Hoa hồng không tồn tại (id: %)', p_commission_id;
    END IF;

    -- Chỉ xử lý commission đang 'pending'
    IF v_commission.status != 'pending' THEN
        RAISE EXCEPTION 'COMMISSION_ALREADY_PROCESSED: Hoa hồng này đã được xử lý (status: %)', v_commission.status;
    END IF;

    -- =====================================================
    -- BƯỚC 2: Lấy thông tin affiliate
    -- =====================================================
    SELECT * INTO v_affiliate
    FROM public.affiliates
    WHERE id = v_commission.affiliate_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'AFFILIATE_NOT_FOUND: Không tìm thấy thông tin affiliate';
    END IF;

    -- Kiểm tra affiliate không bị banned
    IF v_affiliate.status = 'banned' THEN
        RAISE EXCEPTION 'AFFILIATE_BANNED: Tài khoản affiliate đã bị khóa, không thể nhận hoa hồng';
    END IF;

    -- =====================================================
    -- BƯỚC 3: Lock ví Admin và Affiliate theo thứ tự nhất định
    -- (Lock theo thứ tự ID để tránh deadlock)
    -- =====================================================

    -- Lock ví Admin
    SELECT * INTO v_admin_wallet
    FROM public.wallets
    WHERE user_id = p_admin_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_WALLET_NOT_FOUND: Ví Admin không tồn tại';
    END IF;

    -- Kiểm tra Admin có đủ tiền để thanh toán không
    IF v_admin_wallet.available_balance < v_commission.amount THEN
        RAISE EXCEPTION 'ADMIN_INSUFFICIENT_BALANCE: Ví Admin không đủ tiền. Hiện có: %, Cần: %',
            v_admin_wallet.available_balance, v_commission.amount;
    END IF;

    -- Lock ví Affiliate
    SELECT * INTO v_affiliate_wallet
    FROM public.wallets
    WHERE user_id = v_affiliate.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'AFFILIATE_WALLET_NOT_FOUND: Ví của Affiliate không tồn tại';
    END IF;

    -- =====================================================
    -- BƯỚC 4: Thực hiện chuyển tiền
    -- =====================================================

    -- Trừ tiền từ ví Admin
    UPDATE public.wallets
    SET
        available_balance = available_balance - v_commission.amount,
        updated_at        = NOW()
    WHERE id = v_admin_wallet.id;

    -- Cộng tiền vào ví Affiliate
    UPDATE public.wallets
    SET
        available_balance = available_balance + v_commission.amount,
        updated_at        = NOW()
    WHERE id = v_affiliate_wallet.id;

    -- =====================================================
    -- BƯỚC 5: Update commission status
    -- =====================================================
    UPDATE public.commissions
    SET
        status      = 'approved',
        approved_by = p_admin_user_id,
        approved_at = NOW(),
        updated_at  = NOW()
    WHERE id = p_commission_id;

    -- =====================================================
    -- BƯỚC 6: Ghi 2 dòng vào sổ cái transactions
    -- =====================================================

    -- Transaction OUT: Trừ tiền từ ví Admin (chi phí hoa hồng)
    INSERT INTO public.transactions (wallet_id, type, amount, reference_type, reference_id, note)
    VALUES (
        v_admin_wallet.id,
        'OUT',
        v_commission.amount,
        'affiliate_commission',
        p_commission_id::TEXT,
        'Chi trả hoa hồng affiliate – Commission ID: ' || p_commission_id::TEXT
    );

    -- Transaction IN: Cộng tiền vào ví Affiliate (nhận hoa hồng)
    INSERT INTO public.transactions (wallet_id, type, amount, reference_type, reference_id, note)
    VALUES (
        v_affiliate_wallet.id,
        'IN',
        v_commission.amount,
        'affiliate_commission',
        p_commission_id::TEXT,
        'Nhận hoa hồng affiliate từ ' || v_commission.reference_type || ' – ID: ' || COALESCE(v_commission.reference_id, 'N/A')
    );

    -- =====================================================
    -- Trả về kết quả thành công
    -- =====================================================
    RETURN jsonb_build_object(
        'success',               true,
        'commission_id',         p_commission_id,
        'amount',                v_commission.amount,
        'affiliate_user_id',     v_affiliate.user_id,
        'admin_new_balance',     v_admin_wallet.available_balance - v_commission.amount,
        'affiliate_new_balance', v_affiliate_wallet.available_balance + v_commission.amount
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Toàn bộ transaction tự động ROLLBACK khi có EXCEPTION
        RAISE; -- Re-raise để caller nhận được error message
END;
$$;

-- ============================================================
-- 6. RLS Policies cho affiliates và commissions
-- ============================================================
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Affiliate chỉ thấy profile của chính mình
DROP POLICY IF EXISTS affiliates_select_own ON public.affiliates;
CREATE POLICY affiliates_select_own ON public.affiliates
    FOR SELECT USING (auth.uid() = user_id);

-- Commission chỉ thấy của affiliate mình
DROP POLICY IF EXISTS commissions_select_own ON public.commissions;
CREATE POLICY commissions_select_own ON public.commissions
    FOR SELECT USING (
        affiliate_id IN (
            SELECT id FROM public.affiliates WHERE user_id = auth.uid()
        )
    );

-- Grant permissions
GRANT SELECT ON public.affiliates TO authenticated;
GRANT SELECT ON public.commissions TO authenticated;
GRANT ALL ON public.affiliates TO service_role;
GRANT ALL ON public.commissions TO service_role;

-- Grant execute RPC
GRANT EXECUTE ON FUNCTION approve_commission(UUID, UUID) TO service_role;

-- ============================================================
-- HOÀN THÀNH PHASE 2 SCHEMA
-- ============================================================
SELECT 'Phase 2 Affiliate Schema migration completed!' AS status;
