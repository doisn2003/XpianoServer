const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pianoRoutes = require('./routes/pianoRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
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
            }
        }
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pianos', pianoRoutes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   🎹 Xpiano API Server Running 🎹    ║
  ║                                       ║
  ║   Port: ${PORT}                       ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
  ║   API: http://localhost:${PORT}       ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);
});

module.exports = app;
