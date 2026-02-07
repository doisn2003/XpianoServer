# Xpiano Server API

Backend API cho ứng dụng cho thuê đàn piano Xpiano.

## 🚀 Cài đặt

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Khởi tạo database
```bash
npm run init-db
```

### 3. Chạy server
```bash
# Development mode với nodemon
npm run dev

# Production mode
npm start
```

## 📋 API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Pianos

#### 1. Lấy tất cả đàn piano
```http
GET /api/pianos
```

**Query Parameters:**
- `category` (optional): Lọc theo loại đàn (Grand, Upright, Digital, etc.)
- `minRating` (optional): Đánh giá tối thiểu
- `maxPrice` (optional): Giá tối đa mỗi giờ

**Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": 1,
      "created_at": "2024-02-07T07:31:06.665Z",
      "name": "Yamaha C3X Grand",
      "image_url": "https://images.unsplash.com/photo-1552422535-c45813c61732",
      "category": "Grand",
      "price_per_hour": 250000,
      "rating": "4.9",
      "reviews_count": 128,
      "description": "Dòng đàn Grand Piano tiêu chuẩn thế giới...",
      "features": ["Âm thanh vòm", "Phím ngà voi nhân tạo", "Phòng cách âm VIP"]
    }
  ]
}
```

#### 2. Lấy thông tin đàn piano theo ID
```http
GET /api/pianos/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Yamaha C3X Grand",
    ...
  }
}
```

#### 3. Tạo đàn piano mới
```http
POST /api/pianos
```

**Request Body:**
```json
{
  "name": "Steinway Model D",
  "image_url": "https://example.com/image.jpg",
  "category": "Grand",
  "price_per_hour": 500000,
  "rating": 5.0,
  "reviews_count": 50,
  "description": "Đàn piano cao cấp nhất",
  "features": ["Concert Grand", "Premium Sound", "Gold Plated"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo đàn piano thành công",
  "data": { ... }
}
```

#### 4. Cập nhật đàn piano
```http
PUT /api/pianos/:id
```

**Request Body:** (Tất cả fields đều optional)
```json
{
  "name": "Updated Name",
  "price_per_hour": 300000,
  "rating": 4.8
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cập nhật đàn piano thành công",
  "data": { ... }
}
```

#### 5. Xóa đàn piano
```http
DELETE /api/pianos/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Xóa đàn piano thành công",
  "data": { ... }
}
```

#### 6. Lấy thống kê
```http
GET /api/pianos/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_pianos": "10",
    "avg_rating": "4.7",
    "avg_price": "275000",
    "total_categories": "3"
  }
}
```

## 🗄️ Database Schema

### Table: `pianos`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| created_at | TIMESTAMP | Thời gian tạo |
| name | VARCHAR(255) | Tên đàn piano |
| image_url | TEXT | URL hình ảnh |
| category | VARCHAR(100) | Loại đàn (Grand, Upright, etc.) |
| price_per_hour | INTEGER | Giá thuê mỗi giờ (VNĐ) |
| rating | DECIMAL(2,1) | Đánh giá (0-5) |
| reviews_count | INTEGER | Số lượt đánh giá |
| description | TEXT | Mô tả chi tiết |
| features | JSONB | Danh sách tính năng |

## 🛠️ Công nghệ sử dụng

- **Express.js** - Web framework
- **PostgreSQL** - Database (Supabase)
- **pg** - PostgreSQL client
- **dotenv** - Environment variables
- **cors** - Cross-Origin Resource Sharing
- **nodemon** - Development auto-reload

## 📝 Environment Variables

Tạo file `.env` với nội dung:
```
PORT=3000
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=development
```

## 📂 Cấu trúc thư mục

```
XpianoServer/
├── config/
│   └── database.js       # Cấu hình kết nối database
├── controllers/
│   └── pianoController.js # Controller xử lý logic
├── models/
│   └── pianoModel.js     # Model tương tác với database
├── routes/
│   └── pianoRoutes.js    # Định nghĩa routes
├── middlewares/
│   └── errorHandler.js   # Middleware xử lý lỗi
├── scripts/
│   └── initDatabase.js   # Script khởi tạo database
├── .env                  # Environment variables (không commit)
├── .gitignore
├── package.json
├── server.js             # Entry point
└── README.md
```

## 🧪 Testing với cURL

```bash
# Lấy tất cả đàn piano
curl http://localhost:3000/api/pianos

# Lấy đàn piano theo ID
curl http://localhost:3000/api/pianos/1

# Tạo đàn piano mới
curl -X POST http://localhost:3000/api/pianos \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Piano","category":"Grand","price_per_hour":200000}'

# Cập nhật đàn piano
curl -X PUT http://localhost:3000/api/pianos/1 \
  -H "Content-Type: application/json" \
  -d '{"price_per_hour":280000}'

# Xóa đàn piano
curl -X DELETE http://localhost:3000/api/pianos/1

# Lấy thống kê
curl http://localhost:3000/api/pianos/stats
```

## 📧 Contact

For any questions or issues, please contact the development team.
