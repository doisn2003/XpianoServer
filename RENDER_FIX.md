# 🔧 Fix Lỗi Render Deploy - IPv6 Issue

## ❌ Lỗi Hiện Tại
```
Error: connect ENETUNREACH 2406:da18:243:7426:67f8:d84b:ba19:d921:5432
code: 'ENETUNREACH'
```

**Nguyên nhân**: Render free tier không hỗ trợ IPv6. Database URL (port 5432) đang resolve sang IPv6.

---

## ✅ Giải Pháp: Dùng Supabase Connection Pooler

Connection Pooler (port 6543) sử dụng IPv4 và tương thích với Render.

### 📝 DATABASE_URL Đúng (Đã fix URL encoding):

```
postgresql://postgres%2Epjgjusdmzxrhgiptfvbg:4bRV93koPs6QjhGO@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
```

**⚠️ Chi tiết:**
- Username: `postgres.pjgjusdmzxrhgiptfvbg` → URL encoded: `postgres%2Epjgjusdmzxrhgiptfvbg` (dấu chấm = `%2E`)
- Host: `aws-1-ap-southeast-1.pooler.supabase.com`
- Port: `6543` (Transaction pooler)
- Password: `4bRV93koPs6QjhGO`

**🔑 KEY INSIGHT**: Dấu chấm (`.`) trong username PHẢI được URL encode thành `%2E` hoặc PostgreSQL sẽ parse sai!

---

## 🚀 Cách Update trên Render

### Bước 1: Vào Render Dashboard
1. Truy cập: https://dashboard.render.com/
2. Click vào service **xpiano-api** (hoặc tên backend bạn đã đặt)

### Bước 2: Update Environment Variable
1. Click tab **Environment** (bên trái)
2. Tìm biến `DATABASE_URL`
3. Click nút **Edit** (icon bút chì)
4. **Xóa giá trị cũ** và paste giá trị mới:
   ```
   postgresql://postgres.pjgjusdmzxrhgiptfvbg:s8dUYVSMwsPlWAbm@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
5. Click **Save Changes**

### Bước 3: Deploy Lại
- Render sẽ **tự động restart** service sau khi save
- Đợi 2-3 phút cho service restart
- Check logs để confirm kết nối thành công

---

## 🧪 Test Sau Khi Fix

### 1. Check Logs
Vào tab **Logs** trên Render, bạn sẽ thấy:
```
✅ Connected to PostgreSQL database
Server is running on port 5000
```

### 2. Test API Endpoint
Mở browser hoặc dùng curl:
```bash
curl https://xpiano-api.onrender.com/api/pianos
```

Hoặc truy cập trực tiếp: https://xpiano-api.onrender.com/api/pianos

**Nếu thành công**: Bạn sẽ thấy JSON response với danh sách pianos.

### 3. Test từ Frontend
- Mở website Vercel: https://xpiano.vercel.app
- Kiểm tra trang marketplace có hiển thị pianos không
- Test login/register

---

## 📚 Giải Thích Kỹ Thuật

### Direct Connection vs Connection Pooler

| Feature | Direct (Port 5432) | Pooler (Port 6543) |
|---------|-------------------|-------------------|
| Protocol | IPv4/IPv6 | IPv4 only |
| Max Connections | ~60-100 | 10,000+ |
| Connection Reuse | ❌ | ✅ |
| Latency | Thấp hơn | Cao hơn 1-2ms |
| Render Compatibility | ❌ (IPv6 issue) | ✅ |

### Tại sao Render free tier không support IPv6?
- Free tier chạy trên shared infrastructure
- Chỉ support IPv4 outbound connections
- IPv6 chỉ có ở paid tiers

---

## 🔄 Nếu Vẫn Còn Lỗi

### 1. Kiểm tra password trong DATABASE_URL
Password phải khớp với Supabase database password. Lấy lại từ:
- Supabase Dashboard → Settings → Database → Connection String

### 2. Kiểm tra region
Connection pooler URL phải match với region của Supabase project:
- `aws-0-ap-southeast-1` = Singapore region
- Nếu project khác region, URL sẽ khác

### 3. Test local trước
```bash
cd XpianoServer
npm install
npm start
# Nếu local work nhưng Render không -> check env vars
```

### 4. Clear Render Cache
Nếu sau khi update vẫn lỗi:
1. Vào Render Dashboard
2. Manual Deploy → Clear build cache & deploy

---

## 📊 Alternative: Dùng Supabase REST API (Backup Option)

Nếu pooler vẫn không work, có thể dùng Supabase Client SDK thay vì direct SQL:

```javascript
// Thay vì dùng pg Pool
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Query
const { data, error } = await supabase
  .from('pianos')
  .select('*');
```

---

## ✅ Checklist

- [ ] Copy DATABASE_URL mới
- [ ] Update trên Render Environment
- [ ] Save changes và đợi restart
- [ ] Check logs có "Connected to PostgreSQL"
- [ ] Test API endpoint
- [ ] Test frontend Vercel có call được API

---

**Estimated Fix Time: 5 phút** ⏱️

Nếu fix xong vẫn có vấn đề, check logs và báo lại error message cụ thể!
