# 🔐 Xpiano Authentication System

## Tổng quan

Hệ thống xác thực cho Xpiano với 3 loại người dùng:
- **User**: Người dùng thông thường (xem đàn, mua đàn, mượn đàn, tham gia khóa học)
- **Teacher**: Kế thừa từ User + có thể mở lớp học chơi đàn
- **Admin**: Quản lý toàn bộ hệ thống (CRUD đàn piano, quản lý doanh số, quản lý user)

## 🏗️ Kiến trúc

### Database Schema

**Table: `users`**
```sql
id              SERIAL PRIMARY KEY
email           VARCHAR(255) UNIQUE NOT NULL
password        VARCHAR(255) NOT NULL (bcrypt hashed)
full_name       VARCHAR(255) NOT NULL
phone           VARCHAR(20)
role            VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'teacher'))
is_verified     BOOLEAN DEFAULT false
google_id       VARCHAR(255) (cho tương lai - Google login)
avatar_url      TEXT
created_at      TIMESTAMP WITH TIME ZONE
updated_at      TIMESTAMP WITH TIME ZONE
```

**Table: `password_reset_tokens`**
```sql
id              SERIAL PRIMARY KEY
user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE
token           VARCHAR(255) UNIQUE NOT NULL (SHA256 hashed)
expires_at      TIMESTAMP WITH TIME ZONE NOT NULL
used            BOOLEAN DEFAULT false
created_at      TIMESTAMP WITH TIME ZONE
```

### JWT Configuration

- **JWT Secret**: Lưu trong `.env` file
- **Token Expiration**: 7 days (configurable)
- **Token Format**: Bearer token in Authorization header

## 🔌 API Endpoints

### Public Endpoints (Không cần authentication)

#### 1. Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "Nguyễn Văn A",
  "phone": "0912345678",
  "role": "user" // optional: user, teacher (admin chỉ được tạo bởi admin)
}

Response (201):
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "full_name": "Nguyễn Văn A",
      "phone": "0912345678",
      "role": "user",
      "is_verified": false
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Validation Rules:**
- Email: Required, valid format
- Password: Required, minimum 6 characters
- Full name: Required
- Phone: Optional
- Role: Optional, defaults to 'user'

#### 2. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response (200):
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "full_name": "Nguyễn Văn A",
      "phone": "0912345678",
      "role": "user",
      "is_verified": false,
      "avatar_url": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 3. Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}

Response (200):
{
  "success": true,
  "message": "Link đặt lại mật khẩu đã được gửi đến email của bạn",
  "resetUrl": "http://localhost:5173/reset-password?token=abc123..." // only in development
}
```

**Note:** Email sẽ chứa link reset password. Token hết hạn sau 1 giờ.

#### 4. Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "token-from-email",
  "new_password": "newpassword123"
}

Response (200):
{
  "success": true,
  "message": "Đặt lại mật khẩu thành công"
}
```

### Protected Endpoints (Cần authentication)

**Header required:**
```
Authorization: Bearer <jwt-token>
```

#### 5. Get Current User Profile
```http
GET /api/auth/me
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "data": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "Nguyễn Văn A",
    "phone": "0912345678",
    "role": "user",
    "is_verified": false,
    "avatar_url": null,
    "created_at": "2026-02-07T..."
  }
}
```

#### 6. Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "Nguyễn Văn B",
  "phone": "0987654321",
  "avatar_url": "https://example.com/avatar.jpg"
}

Response (200):
{
  "success": true,
  "message": "Cập nhật thông tin thành công",
  "data": { ... }
}
```

#### 7. Change Password
```http
PUT /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "current_password": "oldpassword123",
  "new_password": "newpassword123"
}

Response (200):
{
  "success": true,
  "message": "Đổi mật khẩu thành công"
}
```

#### 8. Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "message": "Đăng xuất thành công"
}
```

**Note:** Vì JWT là stateless, logout chủ yếu được xử lý ở client (xóa token).

## 👥 User Management (Admin Only)

### Admin Endpoints

**Required:** User must be authenticated AND have role = 'admin'

#### 1. Get All Users
```http
GET /api/users
Authorization: Bearer <admin-token>

Query Parameters (optional):
- role: user|admin|teacher
- is_verified: true|false

Response (200):
{
  "success": true,
  "count": 10,
  "data": [...]
}
```

#### 2. Get User by ID
```http
GET /api/users/:id
Authorization: Bearer <admin-token>

Response (200):
{
  "success": true,
  "data": { ... }
}
```

#### 3. Create User
```http
POST /api/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "password123",
  "full_name": "New User",
  "phone": "0900000000",
  "role": "teacher" // admin can create any role
}

Response (201):
{
  "success": true,
  "message": "Tạo người dùng thành công",
  "data": { ... }
}
```

#### 4. Update User
```http
PUT /api/users/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "full_name": "Updated Name",
  "role": "teacher",
  "is_verified": true
}

Response (200):
{
  "success": true,
  "message": "Cập nhật người dùng thành công",
  "data": { ... }
}
```

#### 5. Delete User
```http
DELETE /api/users/:id
Authorization: Bearer <admin-token>

Response (200):
{
  "success": true,
  "message": "Xóa người dùng thành công",
  "data": { ... }
}
```

**Safety:** Admin cannot delete themselves.

#### 6. Get User Statistics
```http
GET /api/users/stats
Authorization: Bearer <admin-token>

Response (200):
{
  "success": true,
  "data": {
    "total_users": "10",
    "total_regular_users": "6",
    "total_teachers": "3",
    "total_admins": "1",
    "verified_users": "0"
  }
}
```

## 🔒 Authorization Levels

### Role Hierarchy

```
User (Lowest)
  └─ Xem đàn piano
  └─ Mua/mượn đàn (future)
  └─ Tham gia khóa học (future)
  └─ Quản lý profile cá nhân

Teacher (Inherits User + Extra)
  └─ All User permissions
  └─ Mở lớp học chơi đàn (future)
  └─ Quản lý học viên (future)

Admin (Highest)
  └─ CRUD đàn piano
  └─ CRUD users (tất cả roles)
  └─ Quản lý doanh số (future)
  └─ Xem thống kê
```

### Middleware Usage

**Require Authentication:**
```javascript
const { authenticate } = require('./middlewares/authMiddleware');

router.get('/protected', authenticate, controller.handler);
```

**Require Specific Role:**
```javascript
const { authenticate, authorize } = require('./middlewares/authMiddleware');

// Admin only
router.get('/admin', authenticate, authorize('admin'), controller.handler);

// Admin or Teacher
router.get('/staff', authenticate, authorize('admin', 'teacher'), controller.handler);
```

**Optional Authentication:**
```javascript
const { optionalAuthenticate } = require('./middlewares/authMiddleware');

// Public route but can access user info if logged in
router.get('/public', optionalAuthenticate, controller.handler);
```

## 🧪 Testing

### Test Credentials

```
Admin:   admin@xpiano.com / admin123
Teacher: teacher@xpiano.com / teacher123
User:    user@xpiano.com / user123
```

### Run Tests

```bash
# Manual tests with REST Client
# Open test-auth.http in VS Code

# Automated tests
npm run test-auth
```

### Example Test Flow

```javascript
// 1. Login
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@xpiano.com',
    password: 'user123'
  })
});
const { data } = await response.json();
const token = data.token;

// 2. Access protected endpoint
const profileResponse = await fetch('http://localhost:3000/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const profile = await profileResponse.json();
```

## 🔐 Security Features

### Implemented

✅ **Password Hashing**
- Using bcryptjs with salt rounds = 10
- Passwords never stored in plain text

✅ **JWT Tokens**
- Secure token generation
- Token expiration (7 days configurable)
- Role-based claims in token

✅ **Password Reset**
- Secure token generation (crypto.randomBytes)
- SHA256 hashing for tokens
- Token expiration (1 hour)
- One-time use tokens

✅ **Email Validation**
- Regex validation
- Duplicate check

✅ **Role-Based Access Control**
- Middleware-based authorization
- Multiple role support

✅ **Security Headers**
- CORS enabled
- JSON parsing limits

### Planned for Future

🔲 **Email Verification**
- Send verification email on register
- Email confirmation link

🔲 **Phone OTP (Vietnam)**
- SMS OTP for login
- Phone verification

🔲 **Google OAuth**
- Social login integration
- Existing user linking

🔲 **Rate Limiting**
- Prevent brute force attacks
- API throttling

🔲 **Refresh Tokens**
- Long-lived refresh tokens
- Token rotation

🔲 **2FA (Two-Factor Authentication)**
- TOTP support
- Backup codes

## 📧 Email Configuration

### Setup (Optional)

Email is used for password reset. Configure in `.env`:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=Xpiano <noreply@xpiano.com>
```

**Gmail Setup:**
1. Enable 2-Factor Authentication
2. Generate App Password
3. Use App Password in `.env`

**Development:**
- If email not configured, reset URL will be logged to console
- Password reset still works, just no email sent

## 🚀 Setup Instructions

### Initial Setup

```bash
# 1. Create auth tables
npm run create-auth-tables

# 2. Create sample users (admin, teacher, user)
npm run create-users

# 3. Start server
npm run dev
```

### Database Setup (Full Reset)

```bash
# 1. Create piano tables
npm run init-db

# 2. Add sample pianos
npm run add-samples

# 3. Create auth tables
npm run create-auth-tables

# 4. Create sample users
npm run create-users

# 5. Test everything
npm run test-auth
```

## 🐛 Error Responses

### Authentication Errors

**401 Unauthorized - No token**
```json
{
  "success": false,
  "message": "Vui lòng đăng nhập để tiếp tục"
}
```

**401 Unauthorized - Invalid token**
```json
{
  "success": false,
  "message": "Token không hợp lệ"
}
```

**401 Unauthorized - Expired token**
```json
{
  "success": false,
  "message": "Token đã hết hạn, vui lòng đăng nhập lại"
}
```

### Authorization Errors

**403 Forbidden**
```json
{
  "success": false,
  "message": "Bạn không có quyền truy cập tài nguyên này"
}
```

### Validation Errors

**400 Bad Request - Missing fields**
```json
{
  "success": false,
  "message": "Email, mật khẩu và họ tên là bắt buộc"
}
```

**409 Conflict - Duplicate email**
```json
{
  "success": false,
  "message": "Email đã được sử dụng"
}
```

## 📚 Related Files

```
XpianoServer/
├── models/
│   └── userModel.js              # User database operations
├── controllers/
│   ├── authController.js         # Auth logic (register, login, etc)
│   └── userController.js         # User management (admin)
├── middlewares/
│   └── authMiddleware.js         # JWT auth & role check
├── routes/
│   ├── authRoutes.js             # Auth endpoints
│   └── userRoutes.js             # User management endpoints
├── scripts/
│   ├── createAuthTables.js       # Create auth tables
│   └── createSampleUsers.js      # Create test users
├── test-auth.http                # REST Client tests
└── test-auth-api.js              # Automated tests
```

## 🎯 Next Steps

### Immediate Extensions
- [ ] Email verification
- [ ] Profile image upload
- [ ] More detailed user profiles

### Future Authentication
- [ ] Phone OTP (Vietnam numbers)
- [ ] Google OAuth
- [ ] Refresh token mechanism
- [ ] 2FA support

### Future Authorization
- [ ] Granular permissions
- [ ] Custom roles
- [ ] Permission groups

---

**Version:** 2.0.0  
**Last Updated:** 2026-02-07  
**Status:** ✅ Fully Operational
