const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function updateDb() {
    try {
        await pool.query('ALTER TABLE courses DROP CONSTRAINT courses_status_check;');
        await pool.query(`ALTER TABLE courses ADD CONSTRAINT courses_status_check CHECK (status IN ('draft', 'published', 'active', 'completed', 'cancelled'));`);
        console.log('Successfully updated courses constraints.');

        await pool.query(`UPDATE courses SET status = 'published' WHERE status = 'active';`);
        console.log('Successfully set courses to published.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        pool.end();
    }
}

updateDb();
