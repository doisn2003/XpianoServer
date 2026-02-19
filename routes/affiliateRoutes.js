const express = require('express');
const router = express.Router();
const AffiliateController = require('../controllers/affiliateController');
const { authenticate } = require('../middlewares/authMiddleware');

// Tất cả route affiliate đều yêu cầu xác thực
router.use(authenticate);

// ============================
// USER / AFFILIATE ROUTES
// ============================

/**
 * POST /api/affiliate/register
 * Đăng ký user hiện tại trở thành Affiliate
 * Body: (không cần body, lấy userId từ token)
 */
router.post('/register', AffiliateController.register);

/**
 * GET /api/affiliate/me
 * Lấy thông tin affiliate, thống kê hoa hồng và 20 commissions gần nhất
 */
router.get('/me', AffiliateController.getMyAffiliateInfo);

// ============================
// ADMIN ROUTES
// ============================

/**
 * GET /api/affiliate/admin/commissions
 * Lấy danh sách commissions toàn hệ thống (Admin only)
 * Query params:
 *   - status: 'pending' | 'approved' | 'cancelled' | 'all' (default: 'pending')
 *   - page: số trang (default: 1)
 *   - limit: số items/trang (default: 20, max: 50)
 */
router.get('/admin/commissions', AffiliateController.getAdminCommissions);

/**
 * POST /api/affiliate/admin/approve-commission
 * Duyệt hoa hồng và chuyển tiền tự động (Admin only – ACID via RPC)
 * Body: { commission_id: "uuid" }
 */
router.post('/admin/approve-commission', AffiliateController.approveCommission);

/**
 * POST /api/affiliate/admin/create-commission
 * Tạo hoa hồng thủ công cho 1 referral code (Admin only)
 * Body: { referral_code, amount, reference_type, reference_id?, note? }
 */
router.post('/admin/create-commission', AffiliateController.createCommission);

module.exports = router;
