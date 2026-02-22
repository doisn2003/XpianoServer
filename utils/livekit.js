/**
 * LiveKit helper — token generation & room management.
 *
 * Required env vars:
 *   LIVEKIT_API_KEY    — from LiveKit Cloud dashboard or self-hosted config
 *   LIVEKIT_API_SECRET — from LiveKit Cloud dashboard or self-hosted config
 *   LIVEKIT_URL        — e.g. wss://your-project.livekit.cloud
 */

const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// ============================================================================
// DEFAULT ROLE CONFIGS
// ============================================================================
const DEFAULT_TEACHER_CONFIG = {
    max_video_tracks: 3,
    max_audio_tracks: 1,
    can_publish: true,
    can_subscribe: true,
    can_publish_data: true,
    can_screen_share: true,
    allowed_sources: ['camera_face', 'camera_hands', 'screen_piano', 'audio']
};

const DEFAULT_STUDENT_CONFIG = {
    max_video_tracks: 1,
    max_audio_tracks: 1,
    can_publish: false,
    can_subscribe: true,
    can_publish_data: true,
    can_screen_share: false,
    allowed_sources: ['camera', 'microphone']
};

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Generate a LiveKit access token with role-based permissions.
 *
 * @param {string} roomName    — LiveKit room name
 * @param {string} identity    — user ID
 * @param {string} name        — display name
 * @param {object} options
 * @param {'teacher'|'student'|'guest'} options.role
 * @param {object} options.roomConfig — custom room config (overrides defaults)
 * @param {object} options.metadata  — extra metadata
 * @returns {Promise<string>} JWT token string
 */
async function generateToken(roomName, identity, name, options = {}) {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in .env');
    }

    const { role = 'student', roomConfig, metadata = {} } = options;

    // Determine permissions based on role & optional config override
    let config;
    if (role === 'teacher') {
        config = { ...DEFAULT_TEACHER_CONFIG, ...(roomConfig || {}) };
    } else {
        config = { ...DEFAULT_STUDENT_CONFIG, ...(roomConfig || {}) };
    }

    const tokenMetadata = {
        role,
        allowed_sources: config.allowed_sources,
        max_video_tracks: config.max_video_tracks,
        ...metadata
    };

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name,
        metadata: JSON.stringify(tokenMetadata),
        ttl: '6h'
    });

    token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: config.can_publish,
        canSubscribe: config.can_subscribe,
        canPublishData: config.can_publish_data,
    });

    return await token.toJwt();
}

/**
 * Generate a teacher token with multi-camera permissions.
 */
async function generateTeacherToken(roomName, identity, name, sessionId, customConfig) {
    return generateToken(roomName, identity, name, {
        role: 'teacher',
        roomConfig: customConfig,
        metadata: { session_id: sessionId }
    });
}

/**
 * Generate a student token with limited permissions.
 */
async function generateStudentToken(roomName, identity, name, sessionId, customConfig) {
    return generateToken(roomName, identity, name, {
        role: 'student',
        roomConfig: customConfig,
        metadata: { session_id: sessionId }
    });
}

// ============================================================================
// ROOM SERVICE
// ============================================================================

function getRoomService() {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        console.warn('⚠️ LiveKit env vars not configured, room service unavailable');
        return null;
    }
    return new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

async function deleteRoom(roomName) {
    const svc = getRoomService();
    if (!svc) return;
    try {
        await svc.deleteRoom(roomName);
    } catch (err) {
        console.error('LiveKit deleteRoom error:', err.message);
    }
}

async function listParticipants(roomName) {
    const svc = getRoomService();
    if (!svc) return [];
    try {
        return await svc.listParticipants(roomName);
    } catch (err) {
        console.error('LiveKit listParticipants error:', err.message);
        return [];
    }
}

module.exports = {
    generateToken,
    generateTeacherToken,
    generateStudentToken,
    getRoomService,
    deleteRoom,
    listParticipants,
    LIVEKIT_URL,
    DEFAULT_TEACHER_CONFIG,
    DEFAULT_STUDENT_CONFIG
};
