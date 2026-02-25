-- Tạo Storage Bucket cho Xpiano Media (để lưu ảnh, video của người dùng)
-- Lưu ý: Bucket này được thiết lập là public để ai cũng có thể xem ảnh/video mà không cần token
INSERT INTO storage.buckets (id, name, public) 
VALUES ('xpiano_media', 'xpiano_media', true)
ON CONFLICT (id) DO NOTHING;

-- Bấm chạy lại các Policy để đảm bảo quyền xem công khai (Select)
-- (Nếu có lỗi tồn tại policy thì có thể xóa policy cũ trước)
DROP POLICY IF EXISTS "Public Access to xpiano_media" ON storage.objects;

-- Cho phép tất cả người dùng (Kể cả chưa đăng nhập) có thể tải/xem file từ bucket này
CREATE POLICY "Public Access to xpiano_media" 
ON storage.objects FOR SELECT 
TO public 
USING ( bucket_id = 'xpiano_media' );

-- LƯU Ý BẢO MẬT GHI (UPLOAD):
-- Vì kiến trúc của chúng ta cho phép App xin Pre-signed URL từ Express API,
-- và Express sẽ dùng Service Role Key (hoặc tài khoản có quyền) để sinh URL này,
-- nên Client có thể dùng URL đó để ghi file trực tiếp mà KHÔNG CẦN chúng ta
-- phải mở quyền INSERT cho người dùng Ẩn danh (Anon).
-- Nghĩa là người dùng chỉ có thể upload nếu gọi API lấy link từ Express. Rất an toàn!
