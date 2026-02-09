const pool = require('./config/database');

const createVerificationTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS verification_codes (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                type TEXT NOT NULL, 
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(email, type)
            );
            CREATE INDEX IF NOT EXISTS idx_verification_codes_email_type ON verification_codes(email, type);
        `);
        console.log('✅ Created verification_codes table');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating table:', error);
        process.exit(1);
    }
};

createVerificationTable();
