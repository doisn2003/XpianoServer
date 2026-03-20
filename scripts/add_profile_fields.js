require('dotenv').config({ path: '../.env' });
const pool = require('../config/database');

async function run() {
    try {
        console.log('Adding new columns to profiles table...');
        console.log('DB URL:', process.env.DATABASE_URL);
        await pool.query(`
            ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS occupation TEXT,
            ADD COLUMN IF NOT EXISTS school TEXT,
            ADD COLUMN IF NOT EXISTS location TEXT,
            ADD COLUMN IF NOT EXISTS hobbies TEXT[],
            ADD COLUMN IF NOT EXISTS instruments TEXT[],
            ADD COLUMN IF NOT EXISTS bio TEXT;
        `);
        console.log('Successfully added columns!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding columns:', error);
        process.exit(1);
    }
}

run();
