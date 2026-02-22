const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'db_schema_piano_class.sql'), 'utf-8');
        console.log('Executing SQL to update Database Schema...');
        await pool.query(sql);
        console.log('✅ Piano Class Schema updated successfully!');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error executing SQL Schema:', e);
        process.exit(1);
    }
}
run();
