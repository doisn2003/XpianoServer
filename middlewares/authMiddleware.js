const { supabase } = require('../utils/supabaseClient');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy token xác thực'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify token using Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error('Auth Middleware Error:', error);
            return res.status(401).json({
                success: false,
                message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'
            });
        }

        console.log('Auth Middleware Success. User ID:', user.id);
        // Attach user to request
        req.user = user;
        req.token = token;

        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi xác thực hệ thống',
            error: error.message
        });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Chưa xác thực'
            });
        }

        // Check role from user_metadata or app_metadata
        // Supabase stores role in app_metadata usually, or we put it in user_metadata
        const userRole = req.user.user_metadata?.role || req.user.app_metadata?.role || 'user';

        if (!roles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền truy cập tài nguyên này'
            });
        }

        next();
    };
};

/**
 * Optional authentication - attaches user if token present, continues regardless.
 * Useful for public endpoints where we want to personalize (e.g. is_liked).
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);

        req.user = error ? null : user;
        req.token = error ? null : token;
        next();
    } catch (error) {
        req.user = null;
        next();
    }
};

module.exports = { authenticate, authorize, optionalAuthenticate };

