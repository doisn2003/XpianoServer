-- Migration: Thay đổi từ "Cho thuê theo giờ" sang "Cho thuê theo ngày" và thêm "Giá bán"
-- Date: 2026-02-11
-- Author: Database Migration Script

-- 1. Đổi tên cột price_per_hour thành price_per_day
-- Giữ nguyên dữ liệu hiện tại (sẽ được cập nhật sau bởi admin)
ALTER TABLE pianos 
RENAME COLUMN price_per_hour TO price_per_day;

-- 2. Thêm cột mới 'price' để lưu giá bán
-- Kiểu Integer, cho phép NULL (đàn có thể chỉ thuê không bán)
ALTER TABLE pianos 
ADD COLUMN price INTEGER DEFAULT NULL;

-- 3. Thêm comment để giải thích các cột
COMMENT ON COLUMN pianos.price_per_day IS 'Giá thuê đàn theo ngày (VND)';
COMMENT ON COLUMN pianos.price IS 'Giá bán đàn (VND). NULL nếu đàn chỉ cho thuê không bán';

-- 4. Tạo index để tối ưu query lọc theo giá
CREATE INDEX IF NOT EXISTS idx_pianos_price_per_day ON pianos(price_per_day);
CREATE INDEX IF NOT EXISTS idx_pianos_price ON pianos(price) WHERE price IS NOT NULL;

-- Rollback instructions (nếu cần):
-- ALTER TABLE pianos RENAME COLUMN price_per_day TO price_per_hour;
-- ALTER TABLE pianos DROP COLUMN price;
-- DROP INDEX IF EXISTS idx_pianos_price_per_day;
-- DROP INDEX IF EXISTS idx_pianos_price;
