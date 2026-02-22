-- ============================================================
-- PHASE 1: Wallet & Ledger System Migration
-- Xpiano – Virtual Wallet & Ledger
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. BẢNG wallets
-- Mỗi user có 1 ví duy nhất (unique user_id)
-- available_balance: số tiền có thể rút/dùng
-- locked_balance: số tiền đang bị giữ (chờ xử lý rút)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
    available_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    locked_balance    NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Đảm bảo số dư không âm
    CONSTRAINT wallets_available_balance_non_negative CHECK (available_balance >= 0),
    CONSTRAINT wallets_locked_balance_non_negative    CHECK (locked_balance >= 0)
);

-- ============================================================
-- 2. BẢNG transactions – Sổ cái ghi nhận từng giao dịch
-- type: 'IN' (tiền vào) | 'OUT' (tiền ra)
-- reference_type: nguồn gốc giao dịch
-- reference_id: ID của bản ghi gốc (order, course, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id      UUID NOT NULL REFERENCES public.wallets (id) ON DELETE CASCADE,
    type           VARCHAR(3) NOT NULL,
    amount         NUMERIC(15, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id   VARCHAR(255),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Chỉ chấp nhận 'IN' hoặc 'OUT'
    CONSTRAINT transactions_type_check CHECK (type IN ('IN', 'OUT')),

    -- Số tiền phải lớn hơn 0
    CONSTRAINT transactions_amount_positive CHECK (amount > 0),

    -- reference_type phải là một trong các loại được phép
    CONSTRAINT transactions_reference_type_check CHECK (
        reference_type IS NULL OR reference_type IN (
            'order_piano',
            'course_fee',
            'affiliate_commission',
            'withdrawal_request',
            'deposit',
            'refund'
        )
    )
);

-- ============================================================
-- 3. BẢNG withdrawal_requests – Yêu cầu rút tiền
-- bank_info: JSONB lưu thông tin ngân hàng của user
-- status: pending -> approved | rejected
-- ============================================================
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    wallet_id   UUID NOT NULL REFERENCES public.wallets (id) ON DELETE CASCADE,
    amount      NUMERIC(15, 2) NOT NULL,
    bank_info   JSONB NOT NULL DEFAULT '{}',
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    note        TEXT,
    processed_by UUID REFERENCES public.profiles (id),
    processed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Số tiền phải lớn hơn 0
    CONSTRAINT withdrawal_requests_amount_positive CHECK (amount > 0),

    -- Chỉ chấp nhận các status hợp lệ
    CONSTRAINT withdrawal_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- ============================================================
-- 4. INDEXES để tăng tốc query
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wallets_user_id          ON public.wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id   ON public.transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON public.transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference   ON public.transactions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON public.withdrawal_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests (status);

-- ============================================================
-- 5. TRIGGER: Tự động updated_at cho wallets
-- ============================================================
CREATE OR REPLACE FUNCTION update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallets_updated_at ON public.wallets;
CREATE TRIGGER wallets_updated_at
    BEFORE UPDATE ON public.wallets
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at();

DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at
    BEFORE UPDATE ON public.withdrawal_requests
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at();

-- ============================================================
-- 6. TRIGGER: Tự động tạo wallet khi có user mới trong profiles
-- Mỗi user mới sẽ có ví với balance = 0
-- ============================================================
CREATE OR REPLACE FUNCTION create_wallet_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (user_id, available_balance, locked_balance)
    VALUES (NEW.id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING; -- An toàn nếu trigger chạy trùng
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_user_create_wallet ON public.profiles;
CREATE TRIGGER on_new_user_create_wallet
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION create_wallet_for_new_user();

-- ============================================================
-- 7. Backfill: Tạo wallet cho tất cả user hiện tại chưa có ví
-- Chạy 1 lần sau migration để đảm bảo dữ liệu nhất quán
-- ============================================================
INSERT INTO public.wallets (user_id, available_balance, locked_balance)
SELECT id, 0, 0 FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 8. STORED PROCEDURE: request_withdrawal (ACID-safe)
-- 
-- Logic:
--   1. Lock row ví của user (SELECT FOR UPDATE) để tránh race condition
--   2. Kiểm tra available_balance >= amount
--   3. Trừ available_balance, cộng locked_balance
--   4. Tạo withdrawal_request
--   5. Insert transaction OUT (đã khóa tiền)
--   6. Nếu lỗi bất kỳ bước nào → tự động ROLLBACK
-- ============================================================
CREATE OR REPLACE FUNCTION request_withdrawal(
    p_user_id  UUID,
    p_amount   NUMERIC,
    p_bank_info JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Chạy với quyền owner, bỏ qua RLS để đảm bảo ACID
AS $$
DECLARE
    v_wallet         public.wallets%ROWTYPE;
    v_request_id     UUID;
    v_wallet_id      UUID;
BEGIN
    -- Bước 1: Lấy và LOCK ví của user (tránh race condition)
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE; -- Khóa row trong transaction

    -- Kiểm tra ví tồn tại
    IF NOT FOUND THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: Ví người dùng không tồn tại';
    END IF;

    v_wallet_id := v_wallet.id;

    -- Bước 2: Kiểm tra số dư khả dụng
    IF v_wallet.available_balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Số dư khả dụng không đủ. Hiện có: %, Yêu cầu: %',
            v_wallet.available_balance, p_amount;
    END IF;

    -- Bước 3: Cập nhật ví (trừ available, cộng locked)
    UPDATE public.wallets
    SET
        available_balance = available_balance - p_amount,
        locked_balance    = locked_balance + p_amount,
        updated_at        = NOW()
    WHERE id = v_wallet_id;

    -- Bước 4: Tạo withdrawal_request
    INSERT INTO public.withdrawal_requests (user_id, wallet_id, amount, bank_info, status)
    VALUES (p_user_id, v_wallet_id, p_amount, p_bank_info, 'pending')
    RETURNING id INTO v_request_id;

    -- Bước 5: Ghi vào sổ cái (tiền đang bị khóa - pending withdrawal)
    INSERT INTO public.transactions (wallet_id, type, amount, reference_type, reference_id, note)
    VALUES (
        v_wallet_id,
        'OUT',
        p_amount,
        'withdrawal_request',
        v_request_id::TEXT,
        'Yêu cầu rút tiền - chờ xử lý'
    );

    -- Trả về kết quả thành công
    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request_id,
        'amount', p_amount,
        'new_available_balance', v_wallet.available_balance - p_amount,
        'new_locked_balance', v_wallet.locked_balance + p_amount
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Transaction tự động ROLLBACK khi có exception
        RAISE; -- Re-raise để caller biết lỗi
END;
$$;

-- ============================================================
-- 9. STORED PROCEDURE: process_withdrawal (Admin only - ACID-safe)
--
-- Logic Approve:
--   1. Lock request
--   2. Trừ locked_balance
--   3. Update status = 'approved'
--   (Tiền đã thực sự ra ngoài - không hoàn lại available)
--
-- Logic Reject:
--   1. Lock request
--   2. Trừ locked_balance, cộng trả lại available_balance
--   3. Update status = 'rejected'
--   4. Insert transaction IN (hoàn tiền)
-- ============================================================
CREATE OR REPLACE FUNCTION process_withdrawal(
    p_request_id UUID,
    p_action     VARCHAR,  -- 'approve' hoặc 'reject'
    p_admin_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request  public.withdrawal_requests%ROWTYPE;
    v_wallet   public.wallets%ROWTYPE;
BEGIN
    -- Kiểm tra action hợp lệ
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'INVALID_ACTION: action phải là approve hoặc reject';
    END IF;

    -- Bước 1: Lấy và LOCK request
    SELECT * INTO v_request
    FROM public.withdrawal_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'REQUEST_NOT_FOUND: Yêu cầu rút tiền không tồn tại';
    END IF;

    -- Chỉ xử lý request đang ở trạng thái pending
    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'ALREADY_PROCESSED: Yêu cầu này đã được xử lý (status: %)', v_request.status;
    END IF;

    -- Bước 2: Lock ví tương ứng
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE id = v_request.wallet_id
    FOR UPDATE;

    IF p_action = 'approve' THEN
        -- Approve: Tiền rời khỏi hệ thống (đã chuyển thực tế)
        -- Chỉ trừ locked_balance, KHÔNG hoàn lại available_balance
        UPDATE public.wallets
        SET
            locked_balance = locked_balance - v_request.amount,
            updated_at     = NOW()
        WHERE id = v_request.wallet_id;

        -- Cập nhật request status
        UPDATE public.withdrawal_requests
        SET
            status       = 'approved',
            processed_by = p_admin_id,
            processed_at = NOW(),
            updated_at   = NOW()
        WHERE id = p_request_id;

        -- Không cần insert transaction vì đã insert khi tạo request (OUT - withdrawal_request)

    ELSIF p_action = 'reject' THEN
        -- Reject: Hoàn tiền về available_balance, trừ locked_balance
        UPDATE public.wallets
        SET
            available_balance = available_balance + v_request.amount,
            locked_balance    = locked_balance - v_request.amount,
            updated_at        = NOW()
        WHERE id = v_request.wallet_id;

        -- Cập nhật request status
        UPDATE public.withdrawal_requests
        SET
            status       = 'rejected',
            processed_by = p_admin_id,
            processed_at = NOW(),
            updated_at   = NOW()
        WHERE id = p_request_id;

        -- Insert transaction IN để ghi nhận hoàn tiền
        INSERT INTO public.transactions (wallet_id, type, amount, reference_type, reference_id, note)
        VALUES (
            v_request.wallet_id,
            'IN',
            v_request.amount,
            'withdrawal_request',
            p_request_id::TEXT,
            'Hoàn tiền - Yêu cầu rút tiền bị từ chối'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'action', p_action,
        'amount', v_request.amount
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- ============================================================
-- 10. RLS Policies (Row Level Security)
-- ============================================================

-- Bật RLS cho tất cả bảng wallet
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Wallets: User chỉ thấy ví của mình
DROP POLICY IF EXISTS wallets_select_own ON public.wallets;
CREATE POLICY wallets_select_own ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

-- Transactions: User chỉ thấy giao dịch thuộc ví của mình
DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own ON public.transactions
    FOR SELECT USING (
        wallet_id IN (
            SELECT id FROM public.wallets WHERE user_id = auth.uid()
        )
    );

-- Withdrawal Requests: User chỉ thấy yêu cầu của mình
DROP POLICY IF EXISTS withdrawal_requests_select_own ON public.withdrawal_requests;
CREATE POLICY withdrawal_requests_select_own ON public.withdrawal_requests
    FOR SELECT USING (auth.uid() = user_id);

-- Service role có thể truy cập tất cả (cho backend)
-- Backend dùng service_role key nên bỏ qua RLS
-- Các RPC function dùng SECURITY DEFINER cũng bỏ qua RLS

-- Grant permissions cho authenticated users
GRANT SELECT ON public.wallets TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT SELECT ON public.withdrawal_requests TO authenticated;

-- Service role full access
GRANT ALL ON public.wallets TO service_role;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.withdrawal_requests TO service_role;

-- Grant execute RPC functions
GRANT EXECUTE ON FUNCTION request_withdrawal(UUID, NUMERIC, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_withdrawal(UUID, VARCHAR, UUID) TO service_role;

-- ============================================================
-- HOÀN THÀNH PHASE 1 SCHEMA
-- ============================================================
SELECT 'Phase 1 Wallet Schema migration completed!' AS status;
