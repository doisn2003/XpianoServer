# 🎹 Xpiano - Web Frontend với Supabase

## 📌 Tình huống

Đồng nghiệp dùng **Flutter + Supabase Client** trực tiếp. Để đồng bộ dữ liệu và authentication giữa Web và Mobile, **Web frontend cũng phải dùng Supabase Client**.

## ✅ Câu trả lời: HOÀN TOÀN ĐƯỢC!

Web frontend **100% có thể** dùng Supabase Client giống Flutter. Đây là cách làm **chuẩn** và **được khuyến khích** bởi Supabase.

## 🎯 Kiến trúc cuối cùng

```
┌─────────────────┐
│  Web Frontend   │──┐
│ (React/Vue/HTML)│  │
└─────────────────┘  │
                     ├──→  Supabase
┌─────────────────┐  │      ├─ Auth
│  Flutter Mobile │──┘      ├─ PostgreSQL
└─────────────────┘         ├─ Realtime
                            ├─ Storage
                            └─ RLS
```

**Cả Web và Mobile DÙNG CHUNG:**
- ✅ Authentication
- ✅ Database
- ✅ Realtime sync
- ✅ Storage
- ✅ Authorization (RLS)

## 🚀 Quick Start

### 1. Setup Supabase Database

```bash
# Truy cập Supabase Dashboard
https://supabase.com/dashboard

# Chạy SQL script
# Copy nội dung từ: supabase-setup.sql
# Paste vào: SQL Editor → New Query
```

### 2. Get API Keys

```bash
# Project Settings → API
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Web Frontend Setup

**Option A: HTML thuần (Demo)**
```bash
# Mở file
examples/web-supabase-client.html

# Sửa SUPABASE_URL và SUPABASE_ANON_KEY
# Mở trong browser
```

**Option B: React/Vue/Next.js**
```bash
npm install @supabase/supabase-js
```

```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

### 4. Authentication

```javascript
// Register
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: { full_name: 'Nguyễn Văn A', role: 'user' }
  }
})

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

// Get current user
const { data: { user } } = await supabase.auth.getUser()

// Logout
await supabase.auth.signOut()
```

### 5. CRUD Pianos

```javascript
// Get all
const { data: pianos } = await supabase.from('pianos').select('*')

// Filter
const { data } = await supabase
  .from('pianos')
  .select('*')
  .eq('category', 'Grand')
  .gte('rating', 4.5)

// Create
const { data } = await supabase
  .from('pianos')
  .insert({ name: 'Yamaha C3X', category: 'Grand', price_per_hour: 250000 })

// Update
const { data } = await supabase
  .from('pianos')
  .update({ price_per_hour: 300000 })
  .eq('id', 1)

// Delete
const { data } = await supabase
  .from('pianos')
  .delete()
  .eq('id', 1)
```

## 📁 Files

| File | Description |
|------|-------------|
| `MIGRATION_TO_SUPABASE.md` | 📚 Hướng dẫn chi tiết migrate từ Express sang Supabase |
| `supabase-setup.sql` | 🗄️ SQL script setup database với RLS |
| `examples/web-supabase-client.html` | 🌐 Demo HTML + Supabase hoàn chỉnh |
| `README_SUPABASE.md` | 📖 File này - Quick reference |

## 🔐 Authorization với RLS

Thay vì middleware Express, dùng Row Level Security:

```sql
-- Only admin can modify pianos
CREATE POLICY "Admins can update pianos"
ON pianos FOR UPDATE
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
```

**Kiểm tra role trong code:**
```javascript
const { data: { user } } = await supabase.auth.getUser()
const isAdmin = user?.user_metadata?.role === 'admin'

if (isAdmin) {
  // Show admin UI
}
```

## ⚡ Realtime (Bonus!)

```javascript
// Web và Mobile đều nhận updates realtime
const channel = supabase
  .channel('pianos-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'pianos' },
    (payload) => {
      console.log('Change:', payload)
      // Auto update UI
    }
  )
  .subscribe()
```

**Kết quả:** Flutter thêm piano → Web tự động hiện ngay, không cần reload!

## 🎯 Features Built-in

### ✅ Có sẵn trong Supabase:
- 🔐 Google OAuth
- 📱 Phone OTP (Vietnam: +84)
- 📧 Magic Link (passwordless)
- 🔄 Realtime subscriptions
- 📁 File storage
- 🛡️ Row Level Security
- 📊 Analytics dashboard

### ❌ Không cần backend Express cho:
- Authentication
- Simple CRUD
- Authorization
- File upload
- Realtime sync

### ✅ Vẫn cần backend Express (hoặc Edge Functions) cho:
- Payment processing (Stripe, SePay)
- Send emails (complex templates)
- Generate PDFs
- Complex business logic
- Third-party integrations

## 🔄 Vậy Backend Express đã làm?

### Option 1: Bỏ hẳn
Nếu app chỉ cần CRUD đơn giản → Dùng 100% Supabase

### Option 2: Giữ lại cho Complex Logic
```
Supabase: Auth, CRUD, Realtime, Storage
Express: Payment, Email, PDF, Analytics
```

### Option 3: Migrate sang Edge Functions
```javascript
// Supabase Edge Function (Deno)
// Tái sử dụng logic từ Express controllers
```

## 📚 Tài liệu

### Supabase:
- Docs: https://supabase.com/docs
- Auth: https://supabase.com/docs/guides/auth
- RLS: https://supabase.com/docs/guides/auth/row-level-security
- Realtime: https://supabase.com/docs/guides/realtime

### Project docs:
- `MIGRATION_TO_SUPABASE.md` - Chi tiết migration
- `supabase-setup.sql` - SQL script
- `examples/web-supabase-client.html` - Working demo

## ✨ So sánh

### Express Backend (Cũ):
```javascript
// Phải tự làm mọi thứ
✅ Full control
❌ Tốn thời gian setup
❌ Phải deploy backend
❌ Phải maintain
❌ Không có realtime built-in
```

### Supabase Client (Mới):
```javascript
// Mọi thứ có sẵn
✅ Auth ready (Google, Phone)
✅ Realtime ready
✅ Storage ready
✅ No deploy backend
✅ Auto-scale
✅ Web và Mobile đồng bộ 100%
❌ Ít control hơn (nhưng đủ cho hầu hết cases)
```

## 🎯 Kết luận

**Đồng nghiệp đúng!** Dùng Supabase Client cho cả Web và Mobile là cách tốt nhất để:
- ✅ Đồng bộ hoàn toàn
- ✅ Ít code hơn
- ✅ Deploy dễ dàng
- ✅ Features built-in (OAuth, Realtime, Storage)

Backend Express có thể:
- Bỏ hẳn (nếu đơn giản)
- Giữ lại cho complex logic
- Migrate sang Edge Functions

---

**TL;DR:** 
- Web CÓ THỂ dùng Supabase Client
- Giống hệt Flutter
- Đồng bộ 100%
- Xem `examples/web-supabase-client.html` để chạy ngay!

**Next steps:**
1. Chạy `supabase-setup.sql` trong Supabase
2. Mở `examples/web-supabase-client.html`
3. Sửa API keys
4. Test auth và CRUD
5. Tích hợp vào project thực
