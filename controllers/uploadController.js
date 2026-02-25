const { supabaseAdmin } = require('../utils/supabaseClient');

/**
 * Upload Controller - Signed URL Pattern (Hybrid Approach)
 * 
 * Flow:
 * 1. Frontend requests a signed upload URL from this controller
 * 2. Controller validates user role & permissions (RBAC)
 * 3. Controller generates a signed URL via Supabase Admin (Service Role)
 * 4. Frontend uploads file directly to Supabase Storage using the signed URL
 * 5. Only the resulting public URL is stored in DB columns (NOT binary data)
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime']; // .mp4, .mov
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;   // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;   // 50MB

// Upload type → bucket mapping & RBAC
const UPLOAD_CONFIG = {
    avatar: {
        bucket: 'avatars',
        allowedRoles: ['user', 'teacher', 'admin'],
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        maxSize: MAX_IMAGE_SIZE,
        getPath: (userId, filename) => `${userId}/${filename}`,
    },
    course_image: {
        bucket: 'courses',
        allowedRoles: ['teacher', 'admin'],
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        maxSize: MAX_IMAGE_SIZE,
        getPath: (userId, filename) => `images/${userId}/${filename}`,
    },
    course_video: {
        bucket: 'courses',
        allowedRoles: ['teacher', 'admin'],
        allowedMimeTypes: ALLOWED_VIDEO_TYPES,
        maxSize: MAX_VIDEO_SIZE,
        getPath: (userId, filename) => `videos/${userId}/${filename}`,
    },
    certificate: {
        bucket: 'courses',
        allowedRoles: ['teacher', 'admin'],
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        maxSize: MAX_IMAGE_SIZE,
        getPath: (userId, filename) => `certs/${userId}/${filename}`,
    },
    piano_image: {
        bucket: 'pianos',
        allowedRoles: ['admin'],
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        maxSize: MAX_IMAGE_SIZE,
        getPath: (_userId, filename, resourceId) => `images/${resourceId}/${filename}`,
    },
    piano_video: {
        bucket: 'pianos',
        allowedRoles: ['admin'],
        allowedMimeTypes: ALLOWED_VIDEO_TYPES,
        maxSize: MAX_VIDEO_SIZE,
        getPath: (_userId, filename, resourceId) => `videos/${resourceId}/${filename}`,
    },
    post_image: {
        bucket: 'xpiano_media',
        allowedRoles: ['user', 'teacher', 'admin'],
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        maxSize: MAX_IMAGE_SIZE,
        getPath: (userId, filename) => `${userId}/${filename}`,
    },
    post_video: {
        bucket: 'xpiano_media',
        allowedRoles: ['user', 'teacher', 'admin'],
        allowedMimeTypes: ALLOWED_VIDEO_TYPES,
        maxSize: MAX_VIDEO_SIZE,
        getPath: (userId, filename) => `${userId}/${filename}`,
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize filename: remove special chars, add timestamp to prevent collisions
 */
function sanitizeFilename(originalName) {
    const ext = originalName.split('.').pop().toLowerCase();
    const baseName = originalName
        .replace(/\.[^/.]+$/, '') // remove extension
        .replace(/[^a-zA-Z0-9_-]/g, '_') // only safe chars
        .substring(0, 50); // limit length
    const timestamp = Date.now();
    return `${baseName}_${timestamp}.${ext}`;
}

/**
 * Get MIME type from filename extension (for server-side validation)
 */
function getMimeFromExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
    };
    return mimeMap[ext] || null;
}

// ─── Controller ──────────────────────────────────────────────────────────────

class UploadController {
    /**
     * POST /api/upload/sign
     * 
     * request body:
     * {
     *   uploadType: 'avatar' | 'course_video' | 'certificate' | 'piano_image' | 'piano_video' | 'post_image' | 'post_video',
     *   fileName: 'original-file-name.jpg',
     *   fileSize: 1234567,         // bytes
     *   contentType: 'image/jpeg', // MIME type
     *   resourceId?: 'piano-uuid'  // required for piano_image / piano_video
     * }
     * 
     * Response:
     * {
     *   success: true,
     *   data: {
     *     signedUrl: 'https://...supabase.co/storage/v1/object/upload/sign/...',
     *     path: 'userId/avatar_123456.jpg',
     *     publicUrl: 'https://...supabase.co/storage/v1/object/public/avatars/userId/avatar_123456.jpg',
     *     token: '...'
     *   }
     * }
     */
    static async getSignedUploadUrl(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.user_metadata?.role || req.user.app_metadata?.role || 'user';

            const { uploadType, fileName, fileSize, contentType, resourceId } = req.body;

            // 1. Validate uploadType exists
            if (!uploadType || !UPLOAD_CONFIG[uploadType]) {
                return res.status(400).json({
                    success: false,
                    message: `Upload type không hợp lệ. Cho phép: ${Object.keys(UPLOAD_CONFIG).join(', ')}`,
                });
            }

            const config = UPLOAD_CONFIG[uploadType];

            // 2. RBAC - Check user role permission
            if (!config.allowedRoles.includes(userRole)) {
                console.warn(`[Upload] RBAC denied: user ${userId} (role: ${userRole}) tried uploadType: ${uploadType}`);
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền upload loại file này',
                });
            }

            // 3. Validate required fields
            if (!fileName) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu tên file (fileName)',
                });
            }

            // 4. Validate file extension / MIME type
            const inferredMime = getMimeFromExtension(fileName);
            const effectiveMime = contentType || inferredMime;

            if (!effectiveMime || !config.allowedMimeTypes.includes(effectiveMime)) {
                return res.status(400).json({
                    success: false,
                    message: `Loại file không được phép. Cho phép: ${config.allowedMimeTypes.join(', ')}`,
                });
            }

            // 5. Validate file size (server-side double-check)
            if (fileSize && fileSize > config.maxSize) {
                const maxMB = (config.maxSize / (1024 * 1024)).toFixed(0);
                return res.status(400).json({
                    success: false,
                    message: `File vượt quá dung lượng cho phép (tối đa ${maxMB}MB)`,
                });
            }

            // 6. Validate resourceId for piano uploads
            if ((uploadType === 'piano_image' || uploadType === 'piano_video') && !resourceId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu resourceId (pianoId) cho upload piano',
                });
            }

            // 7. Build storage path
            const safeName = sanitizeFilename(fileName);
            const storagePath = config.getPath(userId, safeName, resourceId);

            // 8. Generate signed upload URL using Supabase Admin
            const { data, error } = await supabaseAdmin.storage
                .from(config.bucket)
                .createSignedUploadUrl(storagePath);

            if (error) {
                console.error('[Upload] Supabase signed URL error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Không thể tạo signed URL. Vui lòng thử lại.',
                    error: error.message,
                });
            }

            // 9. Build public URL
            const { data: publicUrlData } = supabaseAdmin.storage
                .from(config.bucket)
                .getPublicUrl(storagePath);

            console.log(`[Upload] Signed URL generated for user ${userId} (${userRole}): ${config.bucket}/${storagePath}`);

            return res.status(200).json({
                success: true,
                data: {
                    signedUrl: data.signedUrl,
                    token: data.token,
                    path: storagePath,
                    fullPath: `${config.bucket}/${storagePath}`,
                    publicUrl: publicUrlData.publicUrl,
                },
            });
        } catch (error) {
            console.error('[Upload] Controller error:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi hệ thống khi tạo upload URL',
                error: error.message,
            });
        }
    }

    /**
     * DELETE /api/upload/file
     * 
     * Delete a file from Supabase Storage.
     * Body: { bucket: 'avatars', path: 'userId/avatar_123.jpg' }
     */
    static async deleteFile(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.user_metadata?.role || req.user.app_metadata?.role || 'user';
            const { bucket, path } = req.body;

            if (!bucket || !path) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu bucket hoặc path',
                });
            }

            // Security: non-admin users can only delete their own files
            if (userRole !== 'admin' && !path.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền xóa file này',
                });
            }

            const { error } = await supabaseAdmin.storage
                .from(bucket)
                .remove([path]);

            if (error) {
                console.error('[Upload] Delete error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Không thể xóa file',
                    error: error.message,
                });
            }

            console.log(`[Upload] File deleted: ${bucket}/${path} by user ${userId}`);

            return res.status(200).json({
                success: true,
                message: 'Xóa file thành công',
            });
        } catch (error) {
            console.error('[Upload] Delete controller error:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi hệ thống khi xóa file',
                error: error.message,
            });
        }
    }
}

module.exports = UploadController;
