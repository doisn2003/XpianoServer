/**
 * Script tạo bảng saved_posts cho tính năng Bookmark
 */
const pool = require('../config/database');

async function createSavedPostsTable() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS saved_posts (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, post_id)
            );

            CREATE INDEX IF NOT EXISTS idx_saved_posts_user_id ON saved_posts(user_id);
            CREATE INDEX IF NOT EXISTS idx_saved_posts_post_id ON saved_posts(post_id);
            CREATE INDEX IF NOT EXISTS idx_saved_posts_created_at ON saved_posts(user_id, created_at DESC);
        `);
        console.log('✅ Bảng saved_posts đã được tạo thành công!');
    } catch (err) {
        console.error('❌ Lỗi tạo bảng saved_posts:', err.message);
    } finally {
        client.release();
        process.exit(0);
    }
}

createSavedPostsTable();
