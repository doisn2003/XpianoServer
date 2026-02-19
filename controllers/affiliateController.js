const { supabaseAdmin } = require('../utils/supabaseClient');
const pool = require('../config/database');

// ============================================================
// Helper: Lấy role từ profiles table (nguồn dữ liệu tin cậy)
// ============================================================
async function getUserRoleFromDb(userId) {
    const result = await pool.query(
        'SELECT role FROM profiles WHERE id = $1',
        [userId]
    );
    return result.rows.length > 0 ? result.rows[0].role : null;
}

// ============================================================
// Helper: Tạo referral code ngẫu nhiên dạng "XPIANO_XXXXXX"
// 6 ký tự alphanumeric in hoa
// ============================================================
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Bỏ O,0,I,1 dễ nhầm
    let suffix = '';
    for (let i = 0; i < 6; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `XPIANO_${suffix}`;
}

class AffiliateController {

    // ==========================================================
    // POST /api/affiliate/register
    // Đăng ký user hiện tại trở thành affiliate
    // ==========================================================
    static async register(req, res) {
        try {
            const userId = req.user.id;

            // Kiểm tra user đã là affiliate chưa
            const existing = await pool.query(
                'SELECT id, referral_code, status FROM affiliates WHERE user_id = $1',
                [userId]
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Bạn đã là Affiliate của hệ thống',
                    data: {
                        referral_code: existing.rows[0].referral_code,
                        status: existing.rows[0].status
                    }
                });
            }

            // Tạo referral_code, thử lại nếu bị trùng (rất hiếm xảy ra)
            let referralCode;
            let attempts = 0;
            while (attempts < 5) {
                referralCode = generateReferralCode();
                const codeCheck = await pool.query(
                    'SELECT id FROM affiliates WHERE referral_code = $1',
                    [referralCode]
                );
                if (codeCheck.rows.length === 0) break;
                attempts++;
            }

            if (!referralCode) {
                return res.status(500).json({
                    success: false,
                    message: 'Không thể tạo mã giới thiệu. Vui lòng thử lại.'
                });
            }

            // Lấy commission_rate mặc định (có thể config theo role sau)
            const commissionRate = 0.10; // 10%

            // Insert affiliate record
            const result = await pool.query(
                `INSERT INTO affiliates (user_id, referral_code, commission_rate, status)
                 VALUES ($1, $2, $3, 'active')
                 RETURNING id, user_id, referral_code, commission_rate, status, created_at`,
                [userId, referralCode, commissionRate]
            );

            const affiliate = result.rows[0];
            console.log(`✅ New affiliate registered: ${referralCode} (user: ${userId})`);

            res.status(201).json({
                success: true,
                message: `Đăng ký Affiliate thành công! Mã giới thiệu của bạn: ${referralCode}`,
                data: {
                    id: affiliate.id,
                    referral_code: affiliate.referral_code,
                    commission_rate: parseFloat(affiliate.commission_rate),
                    commission_rate_percent: `${(parseFloat(affiliate.commission_rate) * 100).toFixed(0)}%`,
                    status: affiliate.status,
                    created_at: affiliate.created_at
                }
            });

        } catch (error) {
            console.error('❌ Error in affiliate register:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đăng ký Affiliate',
                error: error.message
            });
        }
    }

    // ==========================================================
    // GET /api/affiliate/me
    // Lấy thông tin affiliate + thống kê hoa hồng của bản thân
    // ==========================================================
    static async getMyAffiliateInfo(req, res) {
        try {
            const userId = req.user.id;

            // 1. Lấy thông tin affiliate
            const affiliateResult = await pool.query(
                `SELECT id, user_id, referral_code, commission_rate, status, created_at, updated_at
                 FROM affiliates
                 WHERE user_id = $1`,
                [userId]
            );

            if (affiliateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Bạn chưa đăng ký chương trình Affiliate',
                    data: null
                });
            }

            const affiliate = affiliateResult.rows[0];

            // 2. Thống kê hoa hồng theo status
            const statsResult = await pool.query(
                `SELECT
                    status,
                    COUNT(*) AS count,
                    COALESCE(SUM(amount), 0) AS total_amount
                 FROM commissions
                 WHERE affiliate_id = $1
                 GROUP BY status`,
                [affiliate.id]
            );

            // Chuẩn hóa stats
            const stats = {
                pending: { count: 0, total: 0 },
                approved: { count: 0, total: 0 },
                cancelled: { count: 0, total: 0 }
            };
            statsResult.rows.forEach(row => {
                if (stats[row.status] !== undefined) {
                    stats[row.status] = {
                        count: parseInt(row.count),
                        total: parseFloat(row.total_amount)
                    };
                }
            });

            // 3. Lấy 20 commissions gần nhất
            const commissionsResult = await pool.query(
                `SELECT id, amount, reference_type, reference_id, status, note, created_at, updated_at
                 FROM commissions
                 WHERE affiliate_id = $1
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [affiliate.id]
            );

            res.status(200).json({
                success: true,
                data: {
                    affiliate: {
                        id: affiliate.id,
                        referral_code: affiliate.referral_code,
                        commission_rate: parseFloat(affiliate.commission_rate),
                        commission_rate_percent: `${(parseFloat(affiliate.commission_rate) * 100).toFixed(0)}%`,
                        status: affiliate.status,
                        created_at: affiliate.created_at,
                        updated_at: affiliate.updated_at
                    },
                    stats: {
                        pending_count: stats.pending.count,
                        pending_total: stats.pending.total,
                        approved_count: stats.approved.count,
                        approved_total: stats.approved.total,
                        cancelled_count: stats.cancelled.count,
                        cancelled_total: stats.cancelled.total,
                        lifetime_earned: stats.approved.total // Tổng thu nhập
                    },
                    commissions: commissionsResult.rows.map(c => ({
                        ...c,
                        amount: parseFloat(c.amount)
                    }))
                }
            });

        } catch (error) {
            console.error('❌ Error in getMyAffiliateInfo:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin Affiliate',
                error: error.message
            });
        }
    }

    // ==========================================================
    // GET /api/affiliate/admin/commissions
    // Admin: Lấy danh sách commissions toàn hệ thống
    // Hỗ trợ: filter theo status, phân trang
    // ==========================================================
    static async getAdminCommissions(req, res) {
        try {
            const adminUserId = req.user.id;

            // Kiểm tra quyền admin
            const adminRole = await getUserRoleFromDb(adminUserId);
            if (!adminRole || adminRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Admin mới có thể xem danh sách hoa hồng'
                });
            }

            // Params (filter + phân trang)
            const status = req.query.status || 'pending';
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // Validate status
            const validStatuses = ['pending', 'approved', 'cancelled', 'all'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `status phải là một trong: ${validStatuses.join(', ')}`
                });
            }

            // Build WHERE clause
            const where = status === 'all' ? '' : `WHERE c.status = $1`;
            const queryParams = status === 'all' ? [limit, offset] : [status, limit, offset];
            const paramOffset = status === 'all' ? 1 : 2;

            // Query với JOIN lấy thông tin user affiliate
            const result = await pool.query(
                `SELECT
                    c.id,
                    c.affiliate_id,
                    c.amount,
                    c.reference_type,
                    c.reference_id,
                    c.status,
                    c.note,
                    c.approved_at,
                    c.created_at,
                    c.updated_at,
                    a.referral_code,
                    a.commission_rate,
                    p.full_name AS affiliate_name,
                    p.email     AS affiliate_email
                 FROM commissions c
                 JOIN affiliates a ON c.affiliate_id = a.id
                 LEFT JOIN profiles p ON a.user_id = p.id
                 ${where}
                 ORDER BY c.created_at DESC
                 LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`,
                queryParams
            );

            // Đếm tổng để phân trang
            const countResult = await pool.query(
                `SELECT COUNT(*) AS total FROM commissions ${status === 'all' ? '' : 'WHERE status = $1'}`,
                status === 'all' ? [] : [status]
            );
            const total = parseInt(countResult.rows[0].total);

            res.status(200).json({
                success: true,
                data: {
                    commissions: result.rows.map(c => ({
                        ...c,
                        amount: parseFloat(c.amount),
                        commission_rate: parseFloat(c.commission_rate)
                    })),
                    pagination: {
                        page,
                        limit,
                        total,
                        total_pages: Math.ceil(total / limit)
                    },
                    filter: { status }
                }
            });

        } catch (error) {
            console.error('❌ Error in getAdminCommissions:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách hoa hồng',
                error: error.message
            });
        }
    }

    // ==========================================================
    // POST /api/affiliate/admin/approve-commission
    // Admin: Duyệt hoa hồng – Gọi RPC approve_commission (ACID-safe)
    //
    // Flow:
    //   1. Validate quyền Admin
    //   2. Validate payload
    //   3. Gọi Supabase RPC approve_commission với admin's user_id
    //   4. Parse lỗi từ PostgreSQL → HTTP status phù hợp
    // ==========================================================
    static async approveCommission(req, res) {
        try {
            const adminUserId = req.user.id;
            const { commission_id } = req.body;

            // Kiểm tra quyền admin
            const adminRole = await getUserRoleFromDb(adminUserId);
            if (!adminRole || adminRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Admin mới có thể duyệt hoa hồng'
                });
            }

            // Validate input
            if (!commission_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu commission_id'
                });
            }

            // Gọi Supabase RPC (SECURITY DEFINER - bỏ qua RLS, ACID-safe)
            console.log(`🔄 Admin ${adminUserId} approving commission ${commission_id}...`);
            const { data, error } = await supabaseAdmin.rpc('approve_commission', {
                p_commission_id: commission_id,
                p_admin_user_id: adminUserId
            });

            if (error) {
                console.error('❌ RPC approve_commission error:', error);

                // Parse PostgreSQL error message để trả về HTTP status phù hợp
                const errMsg = error.message || '';

                if (errMsg.includes('COMMISSION_NOT_FOUND')) {
                    return res.status(404).json({
                        success: false,
                        message: 'Hoa hồng không tồn tại'
                    });
                }
                if (errMsg.includes('COMMISSION_ALREADY_PROCESSED')) {
                    return res.status(409).json({
                        success: false,
                        message: 'Hoa hồng này đã được xử lý trước đó'
                    });
                }
                if (errMsg.includes('ADMIN_INSUFFICIENT_BALANCE')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ví Admin không đủ số dư để chi trả hoa hồng. Vui lòng nạp thêm tiền vào ví Admin.'
                    });
                }
                if (errMsg.includes('AFFILIATE_BANNED')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Tài khoản affiliate đã bị khóa, không thể nhận hoa hồng'
                    });
                }
                if (errMsg.includes('ADMIN_WALLET_NOT_FOUND')) {
                    return res.status(500).json({
                        success: false,
                        message: 'Ví Admin chưa được khởi tạo. Liên hệ kỹ thuật.'
                    });
                }
                if (errMsg.includes('AFFILIATE_NOT_FOUND') || errMsg.includes('AFFILIATE_WALLET_NOT_FOUND')) {
                    return res.status(500).json({
                        success: false,
                        message: 'Không tìm thấy thông tin ví Affiliate. Liên hệ kỹ thuật.'
                    });
                }

                // Generic error
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi duyệt hoa hồng',
                    error: errMsg
                });
            }

            console.log(`✅ Commission ${commission_id} approved. Amount: ${data.amount}`);

            res.status(200).json({
                success: true,
                message: 'Duyệt hoa hồng thành công! Tiền đã được chuyển vào ví Affiliate.',
                data: {
                    commission_id: data.commission_id,
                    amount: parseFloat(data.amount),
                    affiliate_user_id: data.affiliate_user_id,
                    admin_new_balance: parseFloat(data.admin_new_balance),
                    affiliate_new_balance: parseFloat(data.affiliate_new_balance)
                }
            });

        } catch (error) {
            console.error('❌ Error in approveCommission:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi hệ thống khi duyệt hoa hồng',
                error: error.message
            });
        }
    }

    // ==========================================================
    // POST /api/affiliate/admin/create-commission (helper)
    // Admin: Tạo commission thủ công khi 1 đơn hàng dùng referral code
    // (Dùng trong integration với orderController sau này)
    // ==========================================================
    static async createCommission(req, res) {
        try {
            const adminUserId = req.user.id;
            const { referral_code, amount, reference_type, reference_id, note } = req.body;

            const adminRole = await getUserRoleFromDb(adminUserId);
            if (!adminRole || adminRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Admin mới có thể tạo hoa hồng'
                });
            }

            if (!referral_code || !amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu referral_code hoặc amount không hợp lệ'
                });
            }

            const validRefTypes = ['order_piano', 'course_fee'];
            if (!reference_type || !validRefTypes.includes(reference_type)) {
                return res.status(400).json({
                    success: false,
                    message: `reference_type phải là: ${validRefTypes.join(' | ')}`
                });
            }

            // Tìm affiliate theo referral_code
            const affiliateResult = await pool.query(
                `SELECT id, user_id, status FROM affiliates WHERE referral_code = $1`,
                [referral_code]
            );

            if (affiliateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `Mã giới thiệu "${referral_code}" không tồn tại`
                });
            }

            const affiliate = affiliateResult.rows[0];
            if (affiliate.status === 'banned') {
                return res.status(400).json({
                    success: false,
                    message: 'Affiliate này đã bị khóa, không thể nhận hoa hồng'
                });
            }

            // Insert commission với status 'pending'
            const result = await pool.query(
                `INSERT INTO commissions (affiliate_id, amount, reference_type, reference_id, status, note)
                 VALUES ($1, $2, $3, $4, 'pending', $5)
                 RETURNING id, affiliate_id, amount, reference_type, reference_id, status, created_at`,
                [affiliate.id, amount, reference_type, reference_id || null, note || null]
            );

            const commission = result.rows[0];
            console.log(`✅ Commission created: ${commission.id} for affiliate ${referral_code} – Amount: ${amount}`);

            res.status(201).json({
                success: true,
                message: 'Tạo hoa hồng thành công. Hoa hồng đang chờ Admin duyệt.',
                data: {
                    id: commission.id,
                    affiliate_id: commission.affiliate_id,
                    referral_code,
                    amount: parseFloat(commission.amount),
                    reference_type: commission.reference_type,
                    reference_id: commission.reference_id,
                    status: commission.status,
                    created_at: commission.created_at
                }
            });

        } catch (error) {
            console.error('❌ Error in createCommission:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo hoa hồng',
                error: error.message
            });
        }
    }
}

module.exports = AffiliateController;
