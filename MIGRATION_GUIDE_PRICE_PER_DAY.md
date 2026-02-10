# Hướng Dẫn Migration: Từ "Cho Thuê Giờ" sang "Cho Thuê Ngày" và Thêm "Giá Bán"

## Tổng Quan
Migration này thay đổi logic kinh doanh từ **"Cho thuê theo giờ"** sang **"Cho thuê theo ngày"** và thêm chức năng **"Bán đàn"**.

## Các Thay Đổi Chính

### 1. Database Schema Changes
- **Đổi tên cột**: `price_per_hour` → `price_per_day`
- **Thêm cột mới**: `price` (INTEGER, nullable) - Giá bán đàn

### 2. Backend Changes
- Updated `pianoModel.js`: Tất cả queries SQL đã được update
- Updated `orderController.js`: Calculation logic cho rental và buy price
- Updated `favoriteController.js`: Query select thêm field `price`
- Updated TypeScript interfaces trong `lib/pianoService.ts` và `lib/favoriteService.ts`

### 3. Frontend Changes
- Updated tất cả components hiển thị piano information
- Updated Admin Dashboard form để có input cho cả `price_per_day` và `price`
- Updated ProductCard để hiển thị "/ngày" thay vì giá thuê theo giờ
- Updated PianoDetailPage để hiển thị giá bán (nếu có)

## Cách Thực Hiện Migration

### Bước 1: Backup Database
Trước khi chạy migration, **BẮT BUỘC** phải backup database:

```sql
-- Trong Supabase Dashboard: SQL Editor
-- Hoặc sử dụng pg_dump nếu có quyền access
```

### Bước 2: Chạy Migration Script
File migration SQL đã được tạo tại: `XpianoServer/sql/migration_price_per_day_and_price.sql`

**Cách chạy trong Supabase:**
1. Mở Supabase Dashboard
2. Vào **SQL Editor**
3. Copy toàn bộ nội dung file `migration_price_per_day_and_price.sql`
4. Paste vào SQL Editor
5. Click **Run** để thực thi

### Bước 3: Cập Nhật Dữ Liệu Giá
Sau khi chạy migration, **DATA TRONG CỘT `price_per_day` GIỮ NGUYÊN GIÁ TRỊ CŨ** (giá theo giờ).

**Bạn cần cập nhật lại giá cho phù hợp với logic mới:**

```sql
-- Ví dụ: Nếu giá cũ là 120,000đ/giờ, bạn muốn đổi thành 800,000đ/ngày
UPDATE pianos 
SET price_per_day = 800000 
WHERE id = 25;

-- Hoặc update hàng loạt (ví dụ: nhân giá cũ với 8 để ra giá/ngày)
UPDATE pianos 
SET price_per_day = price_per_day * 8;

-- Thêm giá bán cho các đàn cần bán (ví dụ: 50 triệu)
UPDATE pianos 
SET price = 50000000 
WHERE id = 25;
```

### Bước 4: Update Code (Đã Hoàn Thành)
Tất cả code đã được update tự động. Bạn chỉ cần:
- Pull code mới nhất
- Restart backend server
- Restart frontend dev server

### Bước 5: Kiểm Tra
1. **Admin Dashboard**: 
   - Vào trang Admin → Pianos tab
   - Thử tạo piano mới hoặc edit piano hiện tại
   - Kiểm tra fields "Giá thuê/ngày" và "Giá bán"

2. **Piano Detail Page**:
   - Click vào một piano bất kỳ
   - Kiểm tra hiển thị "Giá thuê: XXX/ngày"
   - Kiểm tra hiển thị "Giá bán: XXX" (nếu piano có giá bán)

3. **Order Creation**:
   - Thử tạo order thuê piano
   - Thử tạo order mua piano
   - Kiểm tra tính toán giá có đúng không

## Rollback Instructions
Nếu cần rollback về version cũ:

```sql
-- 1. Đổi tên cột ngược lại
ALTER TABLE pianos RENAME COLUMN price_per_day TO price_per_hour;

-- 2. Xóa cột price
ALTER TABLE pianos DROP COLUMN price;

-- 3. Xóa indexes
DROP INDEX IF EXISTS idx_pianos_price_per_day;
DROP INDEX IF EXISTS idx_pianos_price;
```

Sau đó revert code về commit trước khi migration.

## Lưu Ý Quan Trọng

### ⚠️ Breaking Changes
- **API Response**: Tất cả API trả về piano object sẽ có field `price_per_day` và `price` thay vì `price_per_hour`
- **Order Calculation**: Logic tính giá thuê đã thay đổi (theo ngày thay vì giờ)
- **Buy Price**: Nếu piano có field `price` > 0, sẽ dùng giá này. Nếu không có, sẽ tính từ `price_per_day * 100`

### 💡 Best Practices
- **Giá thuê/ngày**: Nên set khoảng 6-10 lần giá thuê/giờ cũ
- **Giá bán**: Chỉ set cho pianos thực sự muốn bán. Để NULL hoặc 0 cho pianos chỉ cho thuê
- **Testing**: Test kỹ trên staging environment trước khi deploy lên production

## Format Giá Hiển Thị
Tất cả giá đều được format theo chuẩn VND:
- **Frontend**: `new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)`
- **Ví dụ**: 800,000đ/ngày, 50,000,000đ

## Support
Nếu gặp vấn đề trong quá trình migration, vui lòng:
1. Kiểm tra logs trong browser console (Frontend)
2. Kiểm tra logs trong terminal (Backend)
3. Kiểm tra database có chạy script thành công không

---
**Migration Date**: February 11, 2026
**Version**: 2.0.0
