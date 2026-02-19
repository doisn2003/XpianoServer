const { supabaseAdmin } = require('../utils/supabaseClient');
const pool = require('../config/database');

/**
 * Helper: Lấy role của user từ bảng profiles (source of truth)
 * Không dùng user_metadata vì có thể outdated
 */
async function getUserRoleFromDb(userId) {
    const result = await pool.query(
        'SELECT role FROM profiles WHERE id = $1',
        [userId]
    );
    return result.rows.length > 0 ? result.rows[0].role : null;
}

class WalletController {

    /**
     * GET /api/wallet/my-wallet
     * Lấy thông tin ví và 20 giao dịch gần nhất của user đang đăng nhập
     */
    static async getMyWallet(req, res) {
        try {
            const userId = req.user.id;

            // 1. Lấy thông tin ví
            const walletResult = await pool.query(
                `SELECT id, available_balance, locked_balance, created_at, updated_at
                 FROM wallets
                 WHERE user_id = $1`,
                [userId]
            );

            if (walletResult.rows.length === 0) {
                // Ví chưa tồn tại - tự động tạo (safety net)
                const newWalletResult = await pool.query(
                    `INSERT INTO wallets (user_id, available_balance, locked_balance)
                     VALUES ($1, 0, 0)
                     ON CONFLICT (user_id) DO UPDATE
                     SET updated_at = NOW()
                     RETURNING id, available_balance, locked_balance, created_at, updated_at`,
                    [userId]
                );
                var wallet = newWalletResult.rows[0];
            } else {
                var wallet = walletResult.rows[0];
            }

            // 2. Lấy 20 giao dịch gần nhất
            const transactionsResult = await pool.query(
                `SELECT id, type, amount, reference_type, reference_id, note, created_at
                 FROM transactions
                 WHERE wallet_id = $1
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [wallet.id]
            );

            // 3. Lấy danh sách withdrawal_requests đang pending/gần đây
            const withdrawalResult = await pool.query(
                `SELECT id, amount, bank_info, status, created_at, updated_at
                 FROM withdrawal_requests
                 WHERE user_id = $1
                 ORDER BY created_at DESC
                 LIMIT 10`,
                [userId]
            );

            res.status(200).json({
                success: true,
                data: {
                    wallet: {
                        id: wallet.id,
                        available_balance: parseFloat(wallet.available_balance),
                        locked_balance: parseFloat(wallet.locked_balance),
                        total_balance: parseFloat(wallet.available_balance) + parseFloat(wallet.locked_balance),
                        created_at: wallet.created_at,
                        updated_at: wallet.updated_at
                    },
                    transactions: transactionsResult.rows.map(t => ({
                        ...t,
                        amount: parseFloat(t.amount)
                    })),
                    withdrawal_requests: withdrawalResult.rows.map(w => ({
                        ...w,
                        amount: parseFloat(w.amount)
                    }))
                }
            });

        } catch (error) {
            console.error('❌ Error in getMyWallet:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin ví',
                error: error.message
            });
        }
    }

    /**
     * POST /api/wallet/withdraw
     * Tạo yêu cầu rút tiền
     * Gọi RPC request_withdrawal đảm bảo ACID
     */
    static async requestWithdrawal(req, res) {
        try {
            const userId = req.user.id;
            const { amount, bank_info } = req.body;

            // --- Validation ---
            if (!amount || isNaN(amount) || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Số tiền rút tiền phải lớn hơn 0'
                });
            }

            if (!bank_info || !bank_info.bank_name || !bank_info.account_number || !bank_info.account_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp đầy đủ thông tin ngân hàng (bank_name, account_number, account_name)'
                });
            }

            // Số tiền tối thiểu (ví dụ: 50,000 VND)
            const MIN_WITHDRAWAL = 50000;
            if (amount < MIN_WITHDRAWAL) {
                return res.status(400).json({
                    success: false,
                    message: `Số tiền rút tối thiểu là ${MIN_WITHDRAWAL.toLocaleString('vi-VN')} VNĐ`
                });
            }

            // --- Gọi Supabase RPC (ACID-safe) ---
            // SECURITY DEFINER function bỏ qua RLS, dùng supabaseAdmin để có quyền gọi
            const { data, error } = await supabaseAdmin.rpc('request_withdrawal', {
                p_user_id: userId,
                p_amount: amount,
                p_bank_info: bank_info
            });

            if (error) {
                console.error('❌ RPC request_withdrawal error:', error);

                // Parse error message từ PostgreSQL exception
                const errMsg = error.message || '';
                if (errMsg.includes('INSUFFICIENT_BALANCE')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Số dư khả dụng không đủ để thực hiện rút tiền'
                    });
                }
                if (errMsg.includes('WALLET_NOT_FOUND')) {
                    return res.status(404).json({
                        success: false,
                        message: 'Ví của bạn chưa được tạo. Vui lòng liên hệ admin'
                    });
                }

                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi tạo yêu cầu rút tiền',
                    error: errMsg
                });
            }

            res.status(200).json({
                success: true,
                message: 'Yêu cầu rút tiền đã được gửi thành công. Vui lòng chờ admin xử lý.',
                data: {
                    request_id: data.request_id,
                    amount: parseFloat(amount),
                    new_available_balance: parseFloat(data.new_available_balance),
                    new_locked_balance: parseFloat(data.new_locked_balance)
                }
            });

        } catch (error) {
            console.error('❌ Error in requestWithdrawal:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi hệ thống khi xử lý yêu cầu rút tiền',
                error: error.message
            });
        }
    }

    /**
     * GET /api/wallet/admin/requests
     * Admin: Lấy danh sách yêu cầu rút tiền đang pending
     * Yêu cầu: role phải là 'admin' hoặc 'warehouse_owner'
     */
    static async getAdminWithdrawalRequests(req, res) {
        try {
            const userId = req.user.id;

            // Kiểm tra quyền admin từ database (profiles table)
            const adminRole = await getUserRoleFromDb(userId);
            if (!adminRole || (adminRole !== 'admin' && adminRole !== 'warehouse_owner')) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền truy cập tính năng này'
                });
            }

            // Lấy pending requests với thông tin user
            const result = await pool.query(
                `SELECT
                    wr.id,
                    wr.user_id,
                    wr.amount,
                    wr.bank_info,
                    wr.status,
                    wr.note,
                    wr.created_at,
                    wr.updated_at,
                    p.full_name,
                    p.email,
                    p.phone,
                    p.role AS user_role
                 FROM withdrawal_requests wr
                 LEFT JOIN profiles p ON wr.user_id = p.id
                 WHERE wr.status = 'pending'
                 ORDER BY wr.created_at ASC`, //Xử lý theo thứ tự đến trước
            []
            );

            res.status(200).json({
                success: true,
                data: {
                    requests: result.rows.map(r => ({
                        ...r,
                        amount: parseFloat(r.amount)
                    })),
                    total: result.rows.length
                }
            });

        } catch (error) {
            console.error('❌ Error in getAdminWithdrawalRequests:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách yêu cầu rút tiền',
                error: error.message
            });
        }
    }

    /**
     * POST /api/wallet/admin/process-request
     * Admin: Duyệt hoặc từ chối yêu cầu rút tiền
     * Gọi RPC process_withdrawal đảm bảo ACID
     */
    static async processWithdrawalRequest(req, res) {
        try {
            const adminUserId = req.user.id;
            const { request_id, action } = req.body;

            // Kiểm tra quyền admin từ database
            const adminRole = await getUserRoleFromDb(adminUserId);
            if (!adminRole || (adminRole !== 'admin' && adminRole !== 'warehouse_owner')) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thực hiện hành động này'
                });
            }

            // Validation
            if (!request_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu request_id'
                });
            }

            if (!action || !['approve', 'reject'].includes(action)) {
                return res.status(400).json({
                    success: false,
                    message: 'action phải là "approve" hoặc "reject"'
                });
            }

            // --- Gọi Supabase RPC (ACID-safe) ---
            const { data, error } = await supabaseAdmin.rpc('process_withdrawal', {
                p_request_id: request_id,
                p_action: action,
                p_admin_id: adminUserId
            });

            if (error) {
                console.error('❌ RPC process_withdrawal error:', error);

                const errMsg = error.message || '';
                if (errMsg.includes('REQUEST_NOT_FOUND')) {
                    return res.status(404).json({
                        success: false,
                        message: 'Yêu cầu rút tiền không tồn tại'
                    });
                }
                if (errMsg.includes('ALREADY_PROCESSED')) {
                    return res.status(409).json({
                        success: false,
                        message: 'Yêu cầu này đã được xử lý trước đó'
                    });
                }
                if (errMsg.includes('INVALID_ACTION')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Hành động không hợp lệ'
                    });
                }

                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi xử lý yêu cầu rút tiền',
                    error: errMsg
                });
            }

            const actionText = action === 'approve' ? 'Đã xác nhận chuyển tiền' : 'Đã từ chối yêu cầu';
            res.status(200).json({
                success: true,
                message: `${actionText} thành công`,
                data: {
                    request_id: data.request_id,
                    action: data.action,
                    amount: parseFloat(data.amount)
                }
            });

        } catch (error) {
            console.error('❌ Error in processWithdrawalRequest:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi hệ thống khi xử lý yêu cầu',
                error: error.message
            });
        }
    }

    /**
     * POST /api/wallet/admin/add-funds (Admin utility)
     * Thêm tiền vào ví user (ví dụ: thanh toán hoa hồng, doanh thu)
     * Đây là hàm helper để test và tích hợp Phase 2
     */
    static async adminAddFunds(req, res) {
        try {
            const adminUserId = req.user.id;
            const { user_id, amount, reference_type, reference_id, note } = req.body;

            // Kiểm tra quyền admin
            const adminRole = await getUserRoleFromDb(adminUserId);
            if (!adminRole || adminRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Admin mới có thể thực hiện nạp tiền thủ công'
                });
            }

            if (!user_id || !amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu user_id hoặc amount không hợp lệ'
                });
            }

            // Cộng tiền vào ví và ghi sổ cái trong 1 transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Cập nhật ví
                const walletResult = await client.query(
                    `UPDATE wallets
                     SET available_balance = available_balance + $1, updated_at = NOW()
                     WHERE user_id = $2
                     RETURNING id, available_balance`,
                    [amount, user_id]
                );

                if (walletResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        message: 'Ví của user không tồn tại'
                    });
                }

                const walletId = walletResult.rows[0].id;

                // Ghi sổ cái
                await client.query(
                    `INSERT INTO transactions (wallet_id, type, amount, reference_type, reference_id, note)
                     VALUES ($1, 'IN', $2, $3, $4, $5)`,
                    [walletId, amount, reference_type || 'deposit', reference_id || null, note || 'Nạp tiền bởi Admin']
                );

                await client.query('COMMIT');

                res.status(200).json({
                    success: true,
                    message: `Đã nạp ${amount.toLocaleString('vi-VN')} VNĐ vào ví thành công`,
                    data: {
                        user_id,
                        amount_added: amount,
                        new_balance: parseFloat(walletResult.rows[0].available_balance)
                    }
                });

            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }

        } catch (error) {
            console.error('❌ Error in adminAddFunds:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi nạp tiền',
                error: error.message
            });
        }
    }
}

module.exports = WalletController;
