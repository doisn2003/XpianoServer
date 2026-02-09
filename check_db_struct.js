const pool = require('./config/database');

const checkDb = async () => {
    try {
        console.log('--- Checking Public Tables (LIMIT 50) ---');
        const resTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name DESC LIMIT 50
        `);
        console.table(resTables.rows);

        console.log('\n--- Checking Recent Auth Users ---');
        try {
            // Check auth.users table
            const resAuth = await pool.query(`SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 5`);
            if (resAuth.rows.length === 0) console.log('No users in auth.users.');
            else console.table(resAuth.rows);
        } catch (e) {
            console.log('Cannot read auth.users:', e.message);
        }

        console.log('\n--- Checking Recent Public Profiles ---');
        // Check profiles
        try {
            const resProfiles = await pool.query(`SELECT * FROM profiles LIMIT 5`);
            if (resProfiles.rows.length === 0) console.log('No profiles found.');
            else console.table(resProfiles.rows);
        } catch (e) { console.log('Profiles table error:', e.message); }

        console.log('\n--- Checking Recent Public Users ---');
        // Check users (public)
        try {
            const resPublicUsers = await pool.query(`SELECT * FROM users LIMIT 5`);
            if (resPublicUsers.rows.length === 0) console.log('No rows in users table.');
            else console.table(resPublicUsers.rows);
        } catch (e) { console.log('Users table error/not exists:', e.message); }

    } catch (error) {
        console.error('Error running check:', error);
    } finally {
        // Ensure pool disconnects
        setTimeout(() => process.exit(0), 1000);
    }
};

checkDb();
