# 🔄 MIGRATION GUIDE: Express Backend → Supabase Client

## Tình huống

Đồng nghiệp dùng Flutter + Supabase Client, và yêu cầu Web frontend cũng phải làm tương tự để đồng bộ.

## ✅ Câu trả lời: CÓ THỂ và NÊN LÀM!

Web frontend **hoàn toàn có thể** dùng Supabase Client giống Flutter. Đây là cách làm **chuẩn** và **khuyến khích** của Supabase.

---

## 🎯 Kiến trúc mới

### Trước (Backend Express):
```
Web Frontend ──→ Express Backend ──→ Supabase PostgreSQL
                     ↓
                 JWT Auth
                 bcrypt
                 Middleware
```

### Sau (Supabase Client):
```
Web Frontend ─┐
              ├──→ Supabase Auth + PostgreSQL + RLS
Flutter App ──┘
```

**Cả Web và Mobile dùng CHUNG:**
- ✅ Authentication system
- ✅ Database
- ✅ Realtime subscriptions
- ✅ Storage
- ✅ Row Level Security

---

## 📦 Setup Supabase cho Web

### 1. Get Supabase Credentials

Truy cập: https://supabase.com/dashboard → Project → Settings → API

Bạn cần:
```javascript
const SUPABASE_URL = 'https://pjgjusdmzxrhgiptfvbg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJ...' // Public anonymous key
```

### 2. Install Supabase Client

**Option A: NPM (React/Vue/Next.js)**
```bash
npm install @supabase/supabase-js
```

**Option B: CDN (HTML thuần)**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

### 3. Initialize Client

**React/Vue/Next.js:**
```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**HTML thuần:**
```javascript
const supabase = window.supabase.createClient(
  'https://pjgjusdmzxrhgiptfvbg.supabase.co',
  'your-anon-key'
)
```

---

## 🔐 Migration: Authentication

### Express Backend (Cũ):
```javascript
// Register
POST /api/auth/register
{
  email, password, full_name, role
}

// Login
POST /api/auth/login
{
  email, password
}
// Response: { token: "eyJ..." }

// Protected route
headers: { Authorization: "Bearer eyJ..." }
```

### Supabase Client (Mới):
```javascript
// Register
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: {
      full_name: 'Nguyễn Văn A',
      role: 'user'
    }
  }
})

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

// Token được tự động lưu và gửi kèm mọi request

// Get current user
const { data: { user } } = await supabase.auth.getUser()

// Logout
await supabase.auth.signOut()
```

**Bonus features (miễn phí):**
```javascript
// Google OAuth
await supabase.auth.signInWithOAuth({ provider: 'google' })

// Phone OTP (Vietnam)
await supabase.auth.signInWithOtp({
  phone: '+84912345678'
})

// Magic link (passwordless)
await supabase.auth.signInWithOtp({
  email: 'user@example.com'
})
```

---

## 📊 Migration: CRUD Operations

### Express Backend (Cũ):
```javascript
// Get all pianos
const response = await fetch('/api/pianos')
const { data } = await response.json()

// Get with filter
fetch('/api/pianos?category=Grand&minRating=4.5')

// Create
fetch('/api/pianos', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ name, category, price })
})

// Update
fetch('/api/pianos/1', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ price: 300000 })
})

// Delete
fetch('/api/pianos/1', {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
})
```

### Supabase Client (Mới):
```javascript
// Get all pianos
const { data: pianos, error } = await supabase
  .from('pianos')
  .select('*')

// Get with filter
const { data } = await supabase
  .from('pianos')
  .select('*')
  .eq('category', 'Grand')
  .gte('rating', 4.5)
  .order('created_at', { ascending: false })

// Create (Auth token tự động gửi)
const { data, error } = await supabase
  .from('pianos')
  .insert({
    name: 'Yamaha C3X',
    category: 'Grand',
    price_per_hour: 250000
  })

// Update
const { data, error } = await supabase
  .from('pianos')
  .update({ price_per_hour: 300000 })
  .eq('id', 1)

// Delete
const { data, error } = await supabase
  .from('pianos')
  .delete()
  .eq('id', 1)
```

**Bonus: Realtime (Flutter và Web đều nhận):**
```javascript
// Listen for changes
const channel = supabase
  .channel('pianos-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'pianos' },
    (payload) => {
      console.log('Piano changed:', payload)
      // Auto update UI
    }
  )
  .subscribe()
```

---

## 🔒 Migration: Authorization

### Express Backend (Cũ):
```javascript
// Middleware
router.get('/users', authenticate, authorize('admin'), getUsers)
```

### Supabase RLS (Mới):
```sql
-- Enable Row Level Security
ALTER TABLE pianos ENABLE ROW LEVEL SECURITY;

-- Anyone can view pianos
CREATE POLICY "Anyone can view pianos"
ON pianos FOR SELECT
USING (true);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert"
ON pianos FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Only admin can update/delete
CREATE POLICY "Only admins can modify"
ON pianos FOR ALL
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- User can only modify their own data
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);
```

**Kiểm tra role trong app:**
```javascript
const { data: { user } } = await supabase.auth.getUser()
const isAdmin = user?.user_metadata?.role === 'admin'

if (isAdmin) {
  // Show admin UI
}
```

---

## 🗄️ Database Setup

### 1. Tạo bảng giống Express Backend

**Option A: SQL Editor trong Supabase**
```sql
-- Users được Supabase Auth tự tạo trong auth.users
-- Tạo profiles table để lưu thêm thông tin
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger tự tạo profile khi user đăng ký
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Pianos table (giữ nguyên như backend Express)
CREATE TABLE pianos (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  price_per_hour INTEGER,
  rating DECIMAL(2,1),
  reviews_count INTEGER DEFAULT 0,
  description TEXT,
  features TEXT[]
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pianos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Profiles viewable by owner"
ON profiles FOR SELECT
USING (auth.uid() = id OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Anyone can view pianos"
ON pianos FOR SELECT
USING (true);

CREATE POLICY "Admins can manage pianos"
ON pianos FOR ALL
USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
```

### 2. Migrate data từ Express Backend

```javascript
// Script để copy data
const { data: existingPianos } = await supabase
  .from('pianos')
  .select('*')

console.log('Data đã có trong Supabase:', existingPianos)
// Nếu chưa có, insert từ backend cũ
```

---

## 📝 Code Examples

### React Example:

```jsx
// App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [user, setUser] = useState(null)
  const [pianos, setPianos] = useState([])

  useEffect(() => {
    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    loadPianos()
  }, [])

  async function loadPianos() {
    const { data } = await supabase.from('pianos').select('*')
    setPianos(data || [])
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email, password
    })
    if (error) alert(error.message)
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      {user ? (
        <>
          <p>Xin chào {user.email}</p>
          <button onClick={logout}>Đăng xuất</button>
        </>
      ) : (
        <LoginForm onLogin={login} />
      )}
      
      <h2>Danh sách Piano</h2>
      <div className="pianos-grid">
        {pianos.map(piano => (
          <PianoCard key={piano.id} piano={piano} />
        ))}
      </div>
    </div>
  )
}
```

---

## ⚡ Realtime Example (Bonus!)

```javascript
// Lắng nghe thay đổi realtime
const channel = supabase
  .channel('schema-db-changes')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'pianos' },
    (payload) => {
      console.log('Piano mới:', payload.new)
      // Tự động thêm vào UI
      setPianos(prev => [...prev, payload.new])
    }
  )
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'pianos' },
    (payload) => {
      console.log('Piano cập nhật:', payload.new)
      // Tự động update UI
      setPianos(prev => prev.map(p => 
        p.id === payload.new.id ? payload.new : p
      ))
    }
  )
  .subscribe()

// Cleanup
return () => supabase.removeChannel(channel)
```

**Kết quả:** Mobile thêm piano → Web tự động update, không cần reload!

---

## 🔄 Vậy Backend Express làm gì?

### Option 1: Giữ cho Complex Logic

```javascript
// Supabase Edge Function hoặc Express endpoint
// Chỉ dùng cho logic phức tạp

// VD: Payment processing
POST /api/payment/process
// Không thể làm ở client

// VD: Send email
POST /api/email/send-invoice
// Cần API key bí mật

// VD: Generate PDF
POST /api/reports/generate-pdf
// Nặng, nên xử lý server

// VD: Complex analytics
GET /api/analytics/revenue-report
// Join nhiều bảng, tính toán phức tạp
```

### Option 2: Migrate sang Supabase Edge Functions

```javascript
// Supabase Edge Function (Deno)
// supabase/functions/send-invoice/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Server key
  )

  // Copy logic từ Express controller
  const { bookingId } = await req.json()
  
  // Get booking
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, pianos(*), users(*)')
    .eq('id', bookingId)
    .single()

  // Send email (dùng Resend, SendGrid, etc)
  // Generate invoice PDF
  // ...

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### Option 3: Bỏ hẳn Backend (Nếu đơn giản)

Nếu app chỉ cần CRUD đơn giản → **Bỏ hẳn Express, chỉ dùng Supabase**

---

## ✅ Checklist Migration

### Phase 1: Setup (1 ngày)
- [ ] Tạo tables trong Supabase
- [ ] Setup RLS policies
- [ ] Test auth flow
- [ ] Test CRUD operations

### Phase 2: Web Frontend (2-3 ngày)
- [ ] Install @supabase/supabase-js
- [ ] Thay fetch() bằng supabase.from()
- [ ] Thay auth API bằng supabase.auth
- [ ] Test đồng bộ với Flutter

### Phase 3: Migration Data (1 ngày)
- [ ] Copy data từ backend cũ sang Supabase
- [ ] Test data integrity
- [ ] Backup data cũ

### Phase 4: Deploy (1 ngày)
- [ ] Deploy web frontend
- [ ] Update Flutter app
- [ ] Monitor errors
- [ ] Tắt Express backend (hoặc giữ cho complex logic)

---

## 🎯 Kết luận

### ✅ Nên làm:
1. **Web và Mobile cùng dùng Supabase Client**
2. Thiết lập RLS cho security
3. Dùng Supabase Auth (Google, Phone OTP miễn phí)
4. Tận dụng Realtime

### ⚠️ Lưu ý:
1. Phải setup RLS cẩn thận (quan trọng!)
2. Test kỹ authorization
3. Backup data trước khi migrate
4. Giữ Express cho complex logic (nếu cần)

### 📚 Resources:
- Supabase Docs: https://supabase.com/docs
- Auth Helpers: https://supabase.com/docs/guides/auth
- RLS Guide: https://supabase.com/docs/guides/auth/row-level-security
- Realtime: https://supabase.com/docs/guides/realtime

---

**Tóm lại:** Đồng nghiệp của bạn đúng! Supabase Client cho cả Web và Mobile là cách tốt nhất để đồng bộ. Backend Express có thể giữ lại cho business logic phức tạp, hoặc migrate sang Edge Functions.

**File demo:** Xem `examples/web-supabase-client.html`
