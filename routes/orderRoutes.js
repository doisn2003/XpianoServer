const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// User routes
router.get('/my-orders', authenticate, OrderController.getMyOrders);
router.get('/active-rentals', authenticate, OrderController.getMyActiveRentals);
router.post('/', authenticate, OrderController.createOrder);
router.post('/:id/cancel', authenticate, OrderController.cancelOrder);
router.get('/:id/status', authenticate, OrderController.getOrderStatus); // New: Check payment status

// Admin routes
router.get('/stats', authenticate, authorize('admin'), OrderController.getOrderStats);
router.get('/', authenticate, authorize('admin'), OrderController.getAllOrders);
router.put('/:id/status', authenticate, authorize('admin'), OrderController.updateOrderStatus);

module.exports = router;
