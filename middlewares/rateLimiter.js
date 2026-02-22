/**
 * Rate limiting middleware using in-memory store.
 * For production scale, replace with Redis-based limiter.
 */

const rateLimitStore = new Map();

// Clean up expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (now - entry.resetTime > 0) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Create a rate limiter middleware.
 * @param {object} options
 * @param {number} options.windowMs   — time window in ms (default: 60s)
 * @param {number} options.max        — max requests per window (default: 100)
 * @param {string} options.keyPrefix  — prefix for the key (default: 'rl')
 * @param {string} options.message    — error message
 */
function createRateLimiter(options = {}) {
    const {
        windowMs = 60 * 1000,
        max = 100,
        keyPrefix = 'rl',
        message = 'Quá nhiều yêu cầu, vui lòng thử lại sau'
    } = options;

    return (req, res, next) => {
        // Key = prefix + IP + userId (if authenticated)
        const userId = req.user?.id || 'anon';
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const key = `${keyPrefix}:${ip}:${userId}`;

        const now = Date.now();
        let entry = rateLimitStore.get(key);

        if (!entry || now > entry.resetTime) {
            entry = { count: 0, resetTime: now + windowMs };
            rateLimitStore.set(key, entry);
        }

        entry.count++;

        // Set rate limit headers
        const remaining = Math.max(0, max - entry.count);
        const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);
        res.set('X-RateLimit-Limit', max.toString());
        res.set('X-RateLimit-Remaining', remaining.toString());
        res.set('X-RateLimit-Reset', resetSeconds.toString());

        if (entry.count > max) {
            return res.status(429).json({
                success: false,
                message,
                retryAfter: resetSeconds
            });
        }

        next();
    };
}

// Pre-built limiters for common use cases
const apiLimiter = createRateLimiter({ windowMs: 60000, max: 100, keyPrefix: 'api' });
const authLimiter = createRateLimiter({ windowMs: 300000, max: 10, keyPrefix: 'auth', message: 'Quá nhiều lần đăng nhập, thử lại sau 5 phút' });
const uploadLimiter = createRateLimiter({ windowMs: 60000, max: 10, keyPrefix: 'upload' });
const messageLimiter = createRateLimiter({ windowMs: 60000, max: 60, keyPrefix: 'msg' });

module.exports = {
    createRateLimiter,
    apiLimiter,
    authLimiter,
    uploadLimiter,
    messageLimiter
};
