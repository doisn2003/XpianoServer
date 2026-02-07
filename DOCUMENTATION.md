# Xpiano Backend API - Hướng dẫn sử dụng

## ✅ Đã hoàn thành

Backend cho dự án Xpiano đã được tạo thành công với các tính năng sau:

### 🏗️ Kiến trúc MVC
- **Models** (`models/pianoModel.js`): Xử lý logic database
- **Controllers** (`controllers/pianoController.js`): Xử lý business logic
- **Routes** (`routes/pianoRoutes.js`): Định nghĩa API endpoints
- **Middlewares** (`middlewares/errorHandler.js`): Xử lý lỗi toàn cục

### 📊 Database Schema

**Table: `pianos`**
```sql
id              SERIAL PRIMARY KEY
created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
name            VARCHAR(255) NOT NULL
image_url       TEXT
category        VARCHAR(100)
price_per_hour  INTEGER
rating          DECIMAL(2,1)
reviews_count   INTEGER DEFAULT 0
description     TEXT
features        TEXT[] -- Array of strings
```

### 🔌 API Endpoints

#### 1. GET /api/pianos
Lấy danh sách tất cả các đàn piano

**Query Parameters (optional):**
- `category`: Lọc theo loại đàn
- `minRating`: Lọc theo đánh giá tối thiểu
- `maxPrice`: Lọc theo giá tối đa

**Response:**
```json
{
  "success": true,
  "count": 7,
  "data": [...]
}
```

#### 2. GET /api/pianos/:id
Lấy thông tin chi tiết của một cây đàn

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Yamaha C3X Grand",
    "category": "Grand",
    "price_per_hour": 250000,
    "rating": "4.9",
    "features": ["Âm thanh vòm", "Phím ngà voi nhân tạo", "Phòng cách âm VIP"],
    ...
  }
}
```

#### 3. POST /api/pianos
Tạo đàn piano mới

**Request Body:**
```json
{
  "name": "Kawai GL-30 Grand",
  "image_url": "https://...",
  "category": "Grand",
  "price_per_hour": 200000,
  "rating": 4.8,
  "reviews_count": 85,
  "description": "Mô tả...",
  "features": ["Tính năng 1", "Tính năng 2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo đàn piano thành công",
  "data": {...}
}
```

#### 4. PUT /api/pianos/:id
Cập nhật thông tin đàn piano

**Request Body:** (Tất cả fields đều optional)
```json
{
  "name": "Updated Name",
  "price_per_hour": 300000
}
```

#### 5. DELETE /api/pianos/:id
Xóa đàn piano

**Response:**
```json
{
  "success": true,
  "message": "Xóa đàn piano thành công",
  "data": {...}
}
```

#### 6. GET /api/pianos/stats
Lấy thống kê tổng quan

**Response:**
```json
{
  "success": true,
  "data": {
    "total_pianos": "7",
    "avg_rating": "4.7",
    "avg_price": "285714.28",
    "total_categories": "3"
  }
}
```

## 🚀 Cách chạy

### Lần đầu tiên

```bash
# 1. Cài đặt dependencies
npm install

# 2. Khởi tạo database (tạo bảng và insert sample data)
npm run init-db

# 3. Chạy server development mode
npm run dev
```

### Chạy thường xuyên

```bash
# Development mode (auto-reload khi có thay đổi)
npm run dev

# Production mode
npm start
```

Server sẽ chạy tại: **http://localhost:3000**

## 🧪 Test API

### Cách 1: Sử dụng test.http file
Mở file `test.http` trong VS Code với extension REST Client để test các endpoints.

### Cách 2: Sử dụng script Node.js
```bash
node test-api.js
```

### Cách 3: Sử dụng PowerShell
```bash
# GET all pianos
Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/api/pianos | Select-Object -ExpandProperty Content

# Create piano
powershell -File test-create.ps1
```

### Cách 4: Sử dụng curl (nếu có)
```bash
curl http://localhost:3000/api/pianos
```

## 📁 Cấu trúc thư mục

```
XpianoServer/
├── config/
│   └── database.js          # Cấu hình kết nối PostgreSQL
├── controllers/
│   └── pianoController.js   # Controller xử lý requests
├── models/
│   └── pianoModel.js        # Model tương tác database
├── routes/
│   └── pianoRoutes.js       # Định nghĩa routes
├── middlewares/
│   └── errorHandler.js      # Middleware xử lý lỗi
├── scripts/
│   └── initDatabase.js      # Script khởi tạo database
├── .env                     # Environment variables
├── .gitignore
├── package.json
├── server.js                # Entry point
├── README.md
├── test.http                # REST Client tests
└── test-api.js              # Node.js test script
```

## 🔐 Environment Variables

File `.env`:
```
PORT=3000
DATABASE_URL=postgresql://postgres:s8dUYVSMwsPlWAbm@db.pjgjusdmzxrhgiptfvbg.supabase.co:5432/postgres
NODE_ENV=development
```

## ✨ Tính năng đã implement

✅ CRUD đầy đủ cho đàn piano
✅ Filtering (category, rating, price)
✅ Statistics endpoint
✅ Error handling middleware
✅ CORS enabled
✅ Request logging
✅ PostgreSQL với Supabase
✅ Environment variables
✅ Auto-reload với nodemon

## 📝 Notes

- Database sử dụng **TEXT[]** array type cho `features` thay vì JSONB để tương thích tốt hơn với pg library
- Tất cả endpoints đều trả về JSON format với structure nhất quán:
  ```json
  {
    "success": true/false,
    "message": "...",  // optional
    "data": {...}      // optional
  }
  ```
- Server tự động kết nối đến Supabase PostgreSQL database khi khởi động
- Có thể chạy `npm run init-db` nhiều lần (nó sẽ tạo table nếu chưa có)

## 🔧 Troubleshooting

**Port 3000 đã được sử dụng:**
```bash
# Thay đổi PORT trong file .env
PORT=3001
```

**Lỗi kết nối database:**
- Kiểm tra DATABASE_URL trong file .env
- Đảm bảo Supabase database đang hoạt động

**Lỗi CORS khi gọi từ frontend:**
- CORS đã được enable cho tất cả origins (`*`)
- Nếu cần cấu hình cụ thể, chỉnh sửa trong `server.js`

## 🎯 Next Steps

Các tính năng có thể mở rộng:
- [ ] Authentication/Authorization
- [ ] Pagination cho GET /api/pianos
- [ ] Upload images
- [ ] Booking system
- [ ] Reviews system
- [ ] Search functionality
- [ ] Sorting options
- [ ] API rate limiting
- [ ] API documentation với Swagger
- [ ] Unit tests

---

**Tạo bởi:** Xpiano Development Team
**Ngày tạo:** 2026-02-07
**Version:** 1.0.0
