const supabase = require('../utils/supabaseClient');

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
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ hoặc đã hết hạn'
            });
        }

        // Attach user to request
        req.user = user;
        req.token = token;

        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi xác thực'
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

module.exports = { authenticate, authorize };

