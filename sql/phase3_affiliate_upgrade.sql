-- ============================================================
-- PHASE 3: Affiliate System Upgrade
-- Nâng cấp hệ thống affiliate: 30-day window, commission rates,
-- milestone bonuses, và referral tracking
-- Run this in Supabase SQL Editor AFTER phase2_affiliate_schema.sql
-- ============================================================

-- ============================================================
-- 1. CẬP NHẬT BẢNG profiles
-- Thêm cột để tracking người được giới thiệu
-- ============================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS referred_by_affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS affiliate_registered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles (referred_by_affiliate_id);

-- ============================================================
-- 2. CẬP NHẬT BẢNG affiliates
-- Thêm cột đếm số user đã mua hàng thành công
-- ============================================================
ALTER TABLE public.affiliates
    ADD COLUMN IF NOT EXISTS total_active_referred_users INT NOT NULL DEFAULT 0;

-- ============================================================
-- 3. CẬP NHẬT BẢNG commissions
-- Thêm cột phân biệt commission thường vs bonus milestone
-- ============================================================
ALTER TABLE public.commissions
    ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN NOT NULL DEFAULT false;

-- Mở rộng reference_type để chấp nhận thêm 'course_fee' và 'milestone_bonus'
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_reference_type_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_reference_type_check CHECK (
    reference_type IN ('order_piano', 'course_fee', 'milestone_bonus')
);

-- ============================================================
-- 4. STORED PROCEDURE: process_paid_order_affiliate (ACID-safe)
--
-- Business Logic:
--   1. Kiểm tra buyer có được referred không
--   2. Kiểm tra 30-day window
--   3. Tính commission theo loại sản phẩm (15% course, 10% piano)
--   4. Kiểm tra first purchase → increment counter → milestone bonus
-- ============================================================
CREATE OR REPLACE FUNCTION process_paid_order_affiliate(
    p_order_id       TEXT,
    p_buyer_user_id  UUID,
    p_total_price    NUMERIC,
    p_product_type   TEXT  -- 'course' | 'buy' | 'rent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile            RECORD;
    v_affiliate          RECORD;
    v_commission_rate    NUMERIC(5,4);
    v_commission_amount  NUMERIC(15,2);
    v_is_first_purchase  BOOLEAN;
    v_new_count          INT;
    v_bonus_amount       NUMERIC(15,2) := 0;
    v_result             JSONB;
BEGIN
    -- =====================================================
    -- BƯỚC 1: Lấy profile buyer, kiểm tra có được referred không
    -- =====================================================
    SELECT referred_by_affiliate_id, affiliate_registered_at
    INTO v_profile
    FROM public.profiles
    WHERE id = p_buyer_user_id;

    IF NOT FOUND OR v_profile.referred_by_affiliate_id IS NULL THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'NOT_REFERRED');
    END IF;

    -- =====================================================
    -- BƯỚC 2: Kiểm tra 30-day window
    -- =====================================================
    IF v_profile.affiliate_registered_at IS NULL THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'NO_REGISTRATION_DATE');
    END IF;

    IF NOW() > v_profile.affiliate_registered_at + INTERVAL '30 days' THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'EXPIRED_30_DAYS');
    END IF;

    -- =====================================================
    -- BƯỚC 3: Lấy thông tin affiliate referrer
    -- =====================================================
    SELECT id, user_id, commission_rate, status, total_active_referred_users
    INTO v_affiliate
    FROM public.affiliates
    WHERE id = v_profile.referred_by_affiliate_id
    FOR UPDATE; -- Lock để tránh race condition

    IF NOT FOUND THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'AFFILIATE_NOT_FOUND');
    END IF;

    IF v_affiliate.status != 'active' THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'AFFILIATE_INACTIVE');
    END IF;

    -- Chống tự giới thiệu
    IF v_affiliate.user_id = p_buyer_user_id THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'SELF_REFERRAL');
    END IF;

    -- =====================================================
    -- BƯỚC 4: Tính commission rate theo loại sản phẩm
    -- =====================================================
    IF p_product_type = 'course' THEN
        v_commission_rate := 0.15;  -- 15% cho khóa học
    ELSE
        v_commission_rate := 0.10;  -- 10% cho đàn (buy/rent)
    END IF;

    v_commission_amount := ROUND(p_total_price * v_commission_rate, 0);

    IF v_commission_amount <= 0 THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'ZERO_COMMISSION');
    END IF;

    -- =====================================================
    -- BƯỚC 5: Insert standard commission
    -- =====================================================
    INSERT INTO public.commissions (affiliate_id, amount, reference_type, reference_id, status, is_bonus, note)
    VALUES (
        v_affiliate.id,
        v_commission_amount,
        CASE WHEN p_product_type = 'course' THEN 'course_fee' ELSE 'order_piano' END,
        p_order_id,
        'pending',
        false,
        'Hoa hồng ' || (v_commission_rate * 100)::INT || '% từ đơn hàng #' || p_order_id
            || ' (' || p_total_price::TEXT || ' VNĐ)'
    );

    v_result := jsonb_build_object(
        'commission_created', true,
        'commission_amount', v_commission_amount,
        'commission_rate', v_commission_rate
    );

    -- =====================================================
    -- BƯỚC 6: Xét milestone bonus (chỉ khi first purchase)
    -- =====================================================

    -- Kiểm tra xem buyer đã có order 'approved'/'paid' nào khác chưa
    SELECT NOT EXISTS (
        SELECT 1 FROM public.orders
        WHERE user_id = p_buyer_user_id
          AND status IN ('approved', 'paid')
          AND id::TEXT != p_order_id
    ) INTO v_is_first_purchase;

    IF v_is_first_purchase THEN
        -- Increment counter
        v_new_count := v_affiliate.total_active_referred_users + 1;

        UPDATE public.affiliates
        SET total_active_referred_users = v_new_count
        WHERE id = v_affiliate.id;

        v_result := v_result || jsonb_build_object(
            'first_purchase', true,
            'new_referred_count', v_new_count
        );

        -- Milestone check
        IF v_new_count % 50 = 0 THEN
            v_bonus_amount := 1000000;
        ELSIF v_new_count % 10 = 0 THEN
            v_bonus_amount := 500000;
        END IF;

        IF v_bonus_amount > 0 THEN
            INSERT INTO public.commissions (affiliate_id, amount, reference_type, reference_id, status, is_bonus, note)
            VALUES (
                v_affiliate.id,
                v_bonus_amount,
                'milestone_bonus',
                p_order_id,
                'pending',
                true,
                'Thưởng milestone: ' || v_new_count || ' người giới thiệu thành công'
            );

            v_result := v_result || jsonb_build_object(
                'bonus_created', true,
                'bonus_amount', v_bonus_amount,
                'milestone', v_new_count
            );
        END IF;
    ELSE
        v_result := v_result || jsonb_build_object('first_purchase', false);
    END IF;

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- Grant
GRANT EXECUTE ON FUNCTION process_paid_order_affiliate(TEXT, UUID, NUMERIC, TEXT) TO service_role;

-- ============================================================
-- HOÀN THÀNH PHASE 3 SCHEMA UPGRADE
-- ============================================================
SELECT 'Phase 3 Affiliate Upgrade migration completed!' AS status;
