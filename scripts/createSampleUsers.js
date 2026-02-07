const UserModel = require('../models/userModel');

const sampleUsers = [
    {
        email: 'admin@xpiano.com',
        password: 'admin123',
        full_name: 'Admin User',
        phone: '0123456789',
        role: 'admin'
    },
    {
        email: 'teacher@xpiano.com',
        password: 'teacher123',
        full_name: 'Nguyễn Văn Giáo Viên',
        phone: '0987654321',
        role: 'teacher'
    },
    {
        email: 'user@xpiano.com',
        password: 'user123',
        full_name: 'Trần Thị Người Dùng',
        phone: '0369852147',
        role: 'user'
    }
];

async function createSampleUsers() {
    console.log('🔄 Creating sample users...\n');

    try {
        for (const userData of sampleUsers) {
            try {
                // Check if user exists
                const existingUser = await UserModel.findByEmail(userData.email);
                if (existingUser) {
                    console.log(`⚠️  User already exists: ${userData.email} (${userData.role})`);
                    continue;
                }

                // Create user
                const user = await UserModel.create(userData);
                console.log(`✅ Created ${userData.role}: ${user.email}`);
                console.log(`   Name: ${user.full_name}`);
                console.log(`   Password: ${userData.password}`);
                console.log('');
            } catch (error) {
                console.error(`❌ Error creating ${userData.email}:`, error.message);
            }
        }

        console.log('✅ Sample users creation completed!\n');

        // Display statistics
        const stats = await UserModel.getStats();
        console.log('📊 Current User Statistics:');
        console.log(`   Total Users: ${stats.total_users}`);
        console.log(`   - Regular Users: ${stats.total_regular_users}`);
        console.log(`   - Teachers: ${stats.total_teachers}`);
        console.log(`   - Admins: ${stats.total_admins}`);
        console.log(`   Verified: ${stats.verified_users}\n`);

        console.log('📝 Login Credentials:');
        console.log('   Admin:   admin@xpiano.com / admin123');
        console.log('   Teacher: teacher@xpiano.com / teacher123');
        console.log('   User:    user@xpiano.com / user123\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating sample users:', error);
        process.exit(1);
    }
}

createSampleUsers();
