const pool = require('../config/database');

const dropTables = `
  DROP TABLE IF EXISTS password_reset_tokens;
  DROP TABLE IF EXISTS users CASCADE;
`;

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'teacher')),
    is_verified BOOLEAN DEFAULT false,
    google_id VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createPasswordResetTokensTable = `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createIndexes = `
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
`;

async function resetAuthTables() {
    try {
        console.log('🗑️  Dropping existing auth tables...');
        await pool.query(dropTables);
        console.log('✅ Tables dropped successfully');

        console.log('🔄 Creating users table...');
        await pool.query(createUsersTable);
        console.log('✅ Users table created successfully');

        console.log('🔄 Creating password_reset_tokens table...');
        await pool.query(createPasswordResetTokensTable);
        console.log('✅ Password reset tokens table created successfully');

        console.log('🔄 Creating indexes...');
        await pool.query(createIndexes);
        console.log('✅ Indexes created successfully');

        console.log('\n✅ Auth tables reset completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error resetting auth tables:', error);
        process.exit(1);
    }
}

resetAuthTables();
