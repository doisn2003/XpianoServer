const pool = require('../config/database');

async function fix() {
    const client = await pool.connect();
    try {
        // Cập nhật Policy của bảng Posts để dùng auth.jwt() thay vì SELECT bảng profiles (gây đệ quy vô hạn)
        await client.query(`DROP POLICY IF EXISTS "Admins manage all posts" ON public.posts;`);
        await client.query(`
            CREATE POLICY "Admins manage all posts" ON public.posts
            FOR ALL USING (
                current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role' = 'admin' OR
                current_setting('request.jwt.claims', true)::json->>'role' = 'admin'
            );
        `);

        // Cập nhật các bảng khác tương tự (nếu có policy gọi SELECT profiles)
        await client.query(`DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;`);
        await client.query(`
            CREATE POLICY "Admins can view all profiles" ON public.profiles
            FOR SELECT USING (
                current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role' IN ('admin', 'warehouse_owner') OR
                current_setting('request.jwt.claims', true)::json->>'role' IN ('admin', 'warehouse_owner')
            );
        `);

        // Cập nhật policy cho post_comments
        await client.query(`DROP POLICY IF EXISTS "Admins manage all comments" ON public.post_comments;`);
        await client.query(`
            CREATE POLICY "Admins manage all comments" ON public.post_comments
            FOR ALL USING (
                current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role' = 'admin' OR
                current_setting('request.jwt.claims', true)::json->>'role' = 'admin'
            );
        `);

        console.log('Fixed RLS Infinite Recursion (42P17) successfully!');
    } catch (err) {
        console.error('Lỗi khi fix RLS:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

fix();
