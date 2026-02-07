// Automated test script for Auth API
const BASE_URL = 'http://localhost:3000/api';

let adminToken = '';
let userToken = '';
let teacherToken = '';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
    section: (msg) => console.log(`\n${colors.cyan}${'='.repeat(50)}\n${msg}\n${'='.repeat(50)}${colors.reset}\n`)
};

async function testAPI() {
    log.section('🧪 XPIANO AUTH API TESTS');

    // Test 1: Login as Admin
    log.info('Test 1: Login as Admin');
    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@xpiano.com',
                password: 'admin123'
            })
        });
        const data = await response.json();
        if (data.success && data.data.token) {
            adminToken = data.data.token;
            log.success(`Admin login successful - Role: ${data.data.user.role}`);
        } else {
            log.error('Admin login failed');
        }
    } catch (error) {
        log.error(`Admin login error: ${error.message}`);
    }

    // Test 2: Login as Teacher
    log.info('Test 2: Login as Teacher');
    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'teacher@xpiano.com',
                password: 'teacher123'
            })
        });
        const data = await response.json();
        if (data.success && data.data.token) {
            teacherToken = data.data.token;
            log.success(`Teacher login successful - Role: ${data.data.user.role}`);
        } else {
            log.error('Teacher login failed');
        }
    } catch (error) {
        log.error(`Teacher login error: ${error.message}`);
    }

    // Test 3: Login as User
    log.info('Test 3: Login as User');
    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'user@xpiano.com',
                password: 'user123'
            })
        });
        const data = await response.json();
        if (data.success && data.data.token) {
            userToken = data.data.token;
            log.success(`User login successful - Role: ${data.data.user.role}`);
        } else {
            log.error('User login failed');
        }
    } catch (error) {
        log.error(`User login error: ${error.message}`);
    }

    // Test 4: Get Profile (Protected Route)
    log.info('Test 4: Get current user profile');
    try {
        const response = await fetch(`${BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        const data = await response.json();
        if (data.success && data.data) {
            log.success(`Profile retrieved: ${data.data.full_name} (${data.data.email})`);
        } else {
            log.error('Failed to get profile');
        }
    } catch (error) {
        log.error(`Profile error: ${error.message}`);
    }

    // Test 5: Register New User
    log.info('Test 5: Register new user');
    try {
        const response = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `test${Date.now()}@xpiano.com`,
                password: 'test123',
                full_name: 'Test User',
                phone: '0900000000'
            })
        });
        const data = await response.json();
        if (data.success) {
            log.success(`User registered: ${data.data.user.email}`);
        } else {
            log.error(`Registration failed: ${data.message}`);
        }
    } catch (error) {
        log.error(`Registration error: ${error.message}`);
    }

    // Test 6: Get All Users (Admin Only)
    log.info('Test 6: Get all users (Admin)');
    try {
        const response = await fetch(`${BASE_URL}/users`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await response.json();
        if (data.success) {
            log.success(`Retrieved ${data.count} users`);
        } else {
            log.error('Failed to get users');
        }
    } catch (error) {
        log.error(`Get users error: ${error.message}`);
    }

    // Test 7: Try to access admin endpoint as regular user (Should Fail)
    log.info('Test 7: Try admin endpoint as regular user (should fail)');
    try {
        const response = await fetch(`${BASE_URL}/users`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        const data = await response.json();
        if (response.status === 403) {
            log.success('Authorization correctly blocked regular user from admin endpoint');
        } else {
            log.error('Authorization check failed - user should not have access');
        }
    } catch (error) {
        log.error(`Authorization test error: ${error.message}`);
    }

    // Test 8: Get User Statistics (Admin Only)
    log.info('Test 8: Get user statistics (Admin)');
    try {
        const response = await fetch(`${BASE_URL}/users/stats`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await response.json();
        if (data.success && data.data) {
            log.success('User statistics retrieved:');
            console.log('  Total Users:', data.data.total_users);
            console.log('  Regular Users:', data.data.total_regular_users);
            console.log('  Teachers:', data.data.total_teachers);
            console.log('  Admins:', data.data.total_admins);
            console.log('  Verified:', data.data.verified_users);
        } else {
            log.error('Failed to get statistics');
        }
    } catch (error) {
        log.error(`Statistics error: ${error.message}`);
    }

    // Test 9: Forgot Password
    log.info('Test 9: Request password reset');
    try {
        const response = await fetch(`${BASE_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'user@xpiano.com'
            })
        });
        const data = await response.json();
        if (data.success) {
            log.success('Password reset email sent');
            if (data.resetUrl) {
                console.log('  Reset URL (dev):', data.resetUrl);
            }
        } else {
            log.error('Failed to send password reset');
        }
    } catch (error) {
        log.error(`Forgot password error: ${error.message}`);
    }

    // Test 10: Access without token (Should Fail)
    log.info('Test 10: Try protected endpoint without token (should fail)');
    try {
        const response = await fetch(`${BASE_URL}/auth/me`);
        const data = await response.json();
        if (response.status === 401) {
            log.success('Authentication correctly required for protected endpoint');
        } else {
            log.error('Authentication check failed - should require token');
        }
    } catch (error) {
        log.error(`Auth test error: ${error.message}`);
    }

    log.section('✅ TESTS COMPLETED');

    console.log('\n📝 Test Credentials:');
    console.log('   Admin:   admin@xpiano.com / admin123');
    console.log('   Teacher: teacher@xpiano.com / teacher123');
    console.log('   User:    user@xpiano.com / user123\n');
}

testAPI().catch(console.error);
