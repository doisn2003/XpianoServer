# 🚀 XPIANO AUTH - QUICK START

## ✅ Đã hoàn thành

Hệ thống Authentication với đầy đủ tính năng:
- ✅ Register / Login / Logout
- ✅ Forgot Password / Reset Password
- ✅ Profile Management
- ✅ 3 Role: User, Teacher, Admin
- ✅ Role-Based Access Control (RBAC)
- ✅ JWT Authentication
- ✅ Password Hashing (bcrypt)

## 🎯 Test ngay bây giờ!

### 1. Login với tài khoản có sẵn

**Admin Account:**
```bash
Email: admin@xpiano.com
Password: admin123
Role: admin
```

**Teacher Account:**
```bash
Email: teacher@xpiano.com
Password: teacher123
Role: teacher
```

**User Account:**
```bash
Email: user@xpiano.com
Password: user123
Role: user
```

### 2. Test Login (PowerShell)

```powershell
$body = @{
    email = "admin@xpiano.com"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/api/auth/login -Method POST -Body $body -ContentType "application/json"
$data = $response.Content | ConvertFrom-Json
$token = $data.data.token

Write-Host "Token: $token"
Write-Host "User: $($data.data.user.full_name)"
Write-Host "Role: $($data.data.user.role)"
```

### 3. Test với cURL (nếu có)

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@xpiano.com","password":"admin123"}'

# Get Profile (replace TOKEN)
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Test với REST Client (VS Code)

Mở file `test-auth.http` và click "Send Request" ở mỗi endpoint.

### 5. Test tự động

```bash
npm run test-auth
```

## 📋 API Endpoints Summary

### Public (Không cần token)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Đăng ký tài khoản mới |
| `/api/auth/login` | POST | Đăng nhập |
| `/api/auth/forgot-password` | POST | Yêu cầu reset mật khẩu |
| `/api/auth/reset-password` | POST | Đặt lại mật khẩu |

### Protected (Cần token)

| Endpoint | Method | Description | Role |
|----------|--------|-------------|------|
| `/api/auth/me` | GET | Lấy thông tin user | All |
| `/api/auth/profile` | PUT | Cập nhật profile | All |
| `/api/auth/change-password` | PUT | Đổi mật khẩu | All |
| `/api/auth/logout` | POST | Đăng xuất | All |

### Admin Only

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | Danh sách users |
| `/api/users/:id` | GET | Chi tiết user |
| `/api/users` | POST | Tạo user mới |
| `/api/users/:id` | PUT | Cập nhật user |
| `/api/users/:id` | DELETE | Xóa user |
| `/api/users/stats` | GET | Thống kê users |

## 🔑 Authorization Header Format

Tất cả protected endpoints cần header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 👥 Roles & Permissions

### User
- ✅ Xem đàn piano
- ✅ Quản lý profile
- 🔲 Mua/mượn đàn (future)
- 🔲 Tham gia khóa học (future)

### Teacher (= User +)
- ✅ Tất cả quyền của User
- 🔲 Mở lớp học (future)
- 🔲 Quản lý học viên (future)

### Admin
- ✅ CRUD đàn piano
- ✅ CRUD users
- ✅ Xem thống kê
- 🔲 Quản lý doanh số (future)

## 📝 Example Usage

### Register New User

```javascript
const response = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'newuser@example.com',
    password: 'secure_password_123',
    full_name: 'Nguyễn Văn A',
    phone: '0912345678',
    role: 'user' // or 'teacher'
  })
});

const data = await response.json();
console.log('Token:', data.data.token);
```

### Login

```javascript
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@xpiano.com',
    password: 'admin123'
  })
});

const { data } = await response.json();
const token = data.token;
const user = data.user;

console.log('Logged in as:', user.full_name);
console.log('Role:', user.role);

// Save token to localStorage
localStorage.setItem('token', token);
```

### Get Profile

```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:3000/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { data } = await response.json();
console.log('Profile:', data);
```

### Update Profile

```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:3000/api/auth/profile', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    full_name: 'Nguyễn Văn B',
    phone: '0987654321'
  })
});

const { data } = await response.json();
console.log('Updated:', data);
```

### Admin: Get All Users

```javascript
const adminToken = 'admin-jwt-token-here';

const response = await fetch('http://localhost:3000/api/users', {
  headers: {
    'Authorization': `Bearer ${adminToken}`
  }
});

const { data, count } = await response.json();
console.log(`Found ${count} users:`, data);
```

### Logout

```javascript
// Client-side: Remove token
localStorage.removeItem('token');

// Optional: Call logout endpoint
await fetch('http://localhost:3000/api/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## 🔒 Security Best Practices

### Frontend (Client-side)

✅ **DO:**
- Store JWT in localStorage or sessionStorage
- Include token in Authorization header
- Handle token expiration (redirect to login)
- Remove token on logout
- Validate user role before showing UI

❌ **DON'T:**
- Store password
- Send password in URL
- Store token in cookies (XSS risk)
- Expose admin features to non-admin users

### Backend (Already implemented)

✅ **Implemented:**
- Password hashing with bcrypt
- JWT token expiration
- Role-based access control
- Email validation
- Password reset token expiration
- One-time use reset tokens

## 🐛 Common Errors

### "Vui lòng đăng nhập để tiếp tục"
- Missing Authorization header
- Token not in correct format
- Solution: Add `Authorization: Bearer <token>`

### "Token không hợp lệ"
- Invalid or corrupted token
- Solution: Login again to get new token

### "Token đã hết hạn"
- Token expired (after 7 days)
- Solution: Login again

### "Bạn không có quyền truy cập"
- User role doesn't have permission
- Solution: Use correct role account

### "Email đã được sử dụng"
- Email already registered
- Solution: Use different email or login

## 📚 Documentation Links

- **Full Auth Docs**: [AUTH_DOCUMENTATION.md](./AUTH_DOCUMENTATION.md)
- **API Reference**: [README.md](./README.md)
- **Vietnamese Guide**: [DOCUMENTATION.md](./DOCUMENTATION.md)

## 🎓 Tutorial: Building a Frontend

### 1. Login Page

```html
<!-- login.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Xpiano Login</title>
</head>
<body>
  <h1>Login to Xpiano</h1>
  <form id="loginForm">
    <input type="email" id="email" placeholder="Email" required>
    <input type="password" id="password" placeholder="Password" required>
    <button type="submit">Login</button>
  </form>
  <div id="message"></div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
          localStorage.setItem('token', result.data.token);
          localStorage.setItem('user', JSON.stringify(result.data.user));
          
          document.getElementById('message').innerHTML = 
            `✅ Welcome ${result.data.user.full_name}!`;
          
          // Redirect based on role
          if (result.data.user.role === 'admin') {
            window.location.href = '/admin-dashboard.html';
          } else {
            window.location.href = '/dashboard.html';
          }
        } else {
          document.getElementById('message').innerHTML = 
            `❌ ${result.message}`;
        }
      } catch (error) {
        document.getElementById('message').innerHTML = 
          `❌ Error: ${error.message}`;
      }
    });
  </script>
</body>
</html>
```

### 2. Protected Page

```html
<!-- dashboard.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard</title>
</head>
<body>
  <h1>Welcome, <span id="userName"></span></h1>
  <p>Role: <span id="userRole"></span></p>
  <button onclick="logout()">Logout</button>

  <script>
    // Check if logged in
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html';
    }

    // Load user info
    const user = JSON.parse(localStorage.getItem('user'));
    document.getElementById('userName').textContent = user.full_name;
    document.getElementById('userRole').textContent = user.role;

    // Fetch protected data
    async function loadProfile() {
      const response = await fetch('http://localhost:3000/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.status === 401) {
        // Token expired
        localStorage.clear();
        window.location.href = '/login.html';
      }
      
      const { data } = await response.json();
      console.log('Profile:', data);
    }

    function logout() {
      localStorage.clear();
      window.location.href = '/login.html';
    }

    loadProfile();
  </script>
</body>
</html>
```

## 🎯 Next Steps

### Tích hợp Frontend
1. Tạo login/register page
2. Lưu JWT token
3. Gọi protected APIs
4. Handle role-based UI

### Mở rộng Auth
1. Email verification
2. Phone OTP (Việt Nam)
3. Google OAuth
4. 2FA

### Tính năng nghiệp vụ
1. User mua/mượn đàn
2. Teacher mở lớp học
3. Admin quản lý doanh số

---

**Status:** ✅ Ready to use  
**Version:** 2.0.0  
**Date:** 2026-02-07
