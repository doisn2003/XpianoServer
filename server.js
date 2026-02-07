const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pianoRoutes = require('./routes/pianoRoutes');
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
        version: '1.0.0',
        endpoints: {
            pianos: '/api/pianos',
            stats: '/api/pianos/stats'
        }
    });
});

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
