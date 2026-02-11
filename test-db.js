// Quick test script to verify database connection
require('dotenv').config();
const { Pool } = require('pg');

console.log('Testing DATABASE_URL:', process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@')); // Hide password

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connection successful!', res.rows[0]);
    process.exit(0);
  }
});
