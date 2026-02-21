const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

const pianoRoutes = require('./routes/pianoRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const walletRoutes = require('./routes/walletRoutes');
const affiliateRoutes = require('./routes/affiliateRoutes');
const OrderController = require('./controllers/orderController');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { authLimiter, uploadLimiter, messageLimiter } = require('./middlewares/rateLimiter');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Socket.io
const { initSocket } = require('./socket/socketServer');
initSocket(server);

// CORS Configuration - Allow production domains
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'https://xpiano.vercel.app',
    /^https:\/\/xpiano-.*\.vercel\.app$/ // Allow Vercel preview deployments
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Check if origin is allowed
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            return allowed === origin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Xpiano API',
        version: '2.0.0',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                profile: 'GET /api/auth/me',
                forgotPassword: 'POST /api/auth/forgot-password',
                resetPassword: 'POST /api/auth/reset-password'
            },
            pianos: {
                list: 'GET /api/pianos',
                get: 'GET /api/pianos/:id',
                create: 'POST /api/pianos',
                update: 'PUT /api/pianos/:id',
                delete: 'DELETE /api/pianos/:id',
                stats: 'GET /api/pianos/stats'
            },
            users: {
                list: 'GET /api/users (Admin only)',
                get: 'GET /api/users/:id (Admin only)',
                create: 'POST /api/users (Admin only)',
                update: 'PUT /api/users/:id (Admin only)',
                delete: 'DELETE /api/users/:id (Admin only)',
                stats: 'GET /api/users/stats (Admin only)'
            },
            favorites: {
                list: 'GET /api/favorites',
                add: 'POST /api/favorites/:pianoId',
                remove: 'DELETE /api/favorites/:pianoId',
                check: 'GET /api/favorites/check/:pianoId',
                count: 'GET /api/favorites/count/:pianoId'
            },
            orders: {
                list: 'GET /api/orders/my-orders',
                create: 'POST /api/orders',
                cancel: 'POST /api/orders/:id/cancel',
                adminList: 'GET /api/orders (Admin)',
                updateStatus: 'PUT /api/orders/:id/status (Admin)',
                stats: 'GET /api/orders/stats (Admin)'
            }
        }
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pianos', pianoRoutes);
app.use('/api/favorites', require('./routes/favoriteRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/teacher', teacherRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/social', require('./routes/socialRoutes'));
app.use('/api/messages', messageLimiter, require('./routes/messageRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));
// Phase 5
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/moderation', require('./routes/moderationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// SePay Webhook endpoint (public - no auth required for bank webhooks)
app.post('/api/sepay-webhook', OrderController.handleSepayWebhook);

// Health check endpoint (for monitoring/Render)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Xpiano API is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: '🎹 Welcome to Xpiano API',
        version: '1.0.0',
        endpoints: {
            pianos: '/api/pianos',
            teachers: '/api/teacher',
            auth: '/api/auth',
            users: '/api/users',
            health: '/health'
        }
    });
});

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server (using http server for Socket.io)
server.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   🎹 Xpiano API Server Running 🎹    ║
  ║                                       ║
  ║   Port: ${PORT}                       ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
  ║   API: http://localhost:${PORT}       ║
  ║   Socket.io: ✅ enabled               ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);

    // Start cron job: Cancel expired QR orders every minute
    setInterval(() => {
        OrderController.cancelExpiredOrders();
    }, 60 * 1000);

    console.log('⏰ Cron job started: Auto-cancel expired QR orders (every 60s)');
});

module.exports = app;
