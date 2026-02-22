const express = require('express');
const router = express.Router();
const WalletController = require('../controllers/walletController');
const { authenticate } = require('../middlewares/authMiddleware');

// Tất cả route wallet đều yêu cầu xác thực
router.use(authenticate);

// ============================
// USER ROUTES
// ============================

/**
 * GET /api/wallet/my-wallet
 * Lấy thông tin ví và lịch sử giao dịch của user đang đăng nhập
 */
router.get('/my-wallet', WalletController.getMyWallet);

/**
 * POST /api/wallet/withdraw
 * Tạo yêu cầu rút tiền
 * Body: { amount, bank_info: { bank_name, account_number, account_name } }
 */
router.post('/withdraw', WalletController.requestWithdrawal);

// ============================
// ADMIN ROUTES
// ============================

/**
 * GET /api/wallet/admin/requests
 * Lấy danh sách yêu cầu rút tiền đang pending (Admin only)
 */
router.get('/admin/requests', WalletController.getAdminWithdrawalRequests);

/**
 * POST /api/wallet/admin/process-request
 * Xử lý yêu cầu rút tiền (approve/reject) - Admin only
 * Body: { request_id, action: 'approve' | 'reject' }
 */
router.post('/admin/process-request', WalletController.processWithdrawalRequest);

/**
 * POST /api/wallet/admin/add-funds
 * Nạp tiền thủ công vào ví user (Admin only)
 * Body: { user_id, amount, reference_type?, reference_id?, note? }
 */
router.post('/admin/add-funds', WalletController.adminAddFunds);

module.exports = router;
