# Hướng dẫn Tích hợp SePay (VietQR) - Xpiano

## Tổng quan

Tích hợp cổng thanh toán SePay cho phép khách hàng thanh toán đơn hàng qua chuyển khoản ngân hàng với mã QR VietQR.

## Các file đã thay đổi/tạo mới

### Backend (XpianoServer)

1. **`sql/migration_sepay_payment.sql`** - SQL Migration
   - Thêm cột `payment_method` (COD/QR)
   - Thêm cột `transaction_code` 
   - Thêm cột `payment_expired_at`
   - Thêm cột `paid_at`

2. **`controllers/orderController.js`** - Cập nhật
   - Thêm helper `generateSepayQRUrl()`
   - Thêm helper `sendPaymentSuccessEmail()`
   - Cập nhật `createOrder()` để xử lý payment_method
   - Thêm `getOrderStatus()` - API polling trạng thái
   - Thêm `handleSepayWebhook()` - Xử lý webhook từ SePay
   - Thêm `cancelExpiredOrders()` - Cron job hủy đơn quá hạn

3. **`routes/orderRoutes.js`** - Cập nhật
   - Thêm route `GET /api/orders/:id/status`

4. **`server.js`** - Cập nhật
   - Thêm route `POST /api/sepay-webhook`
   - Khởi tạo cron job chạy mỗi 60 giây

### Frontend (Xpiano)

1. **`lib/orderService.ts`** - Cập nhật
   - Thêm types: `PaymentMethod`, `BankInfo`, `OrderResponse`, `OrderStatusResponse`
   - Cập nhật `createOrder()` để nhận thêm `payment_method`
   - Thêm `checkOrderStatus()` cho polling

2. **`components/PaymentModal.tsx`** - Mới
   - Component modal thanh toán hoàn chỉnh
   - Chọn phương thức thanh toán (COD/QR)
   - Hiển thị QR Code với countdown 60 phút
   - Auto-polling kiểm tra trạng thái thanh toán
   - Copy thông tin chuyển khoản

3. **`pages/PianoDetailPage.tsx`** - Cập nhật
   - Tích hợp PaymentModal
   - Tách modal chọn ngày thuê và thanh toán

## Cấu hình .env

```env
# SePay Configuration
SEPAY_API_ACCESS=your_sepay_api_key
BANK_ACCOUNT=0365408910
BANK_NAME=MB
```

## Chạy SQL Migration

1. Vào Supabase Dashboard > SQL Editor
2. Copy nội dung file `sql/migration_sepay_payment.sql`
3. Click "RUN"

## Cấu hình Webhook SePay

1. Đăng nhập SePay Dashboard: https://sepay.vn
2. Vào **Cài đặt** > **Webhook**
3. Thêm webhook URL: `https://your-api-domain.com/api/sepay-webhook`
4. Chọn event: **Giao dịch mới**

## Flow thanh toán

### 1. COD (Thanh toán khi nhận hàng)
```
User chọn COD → Tạo đơn hàng → Status: pending → Admin duyệt
```

### 2. QR (Chuyển khoản VietQR)
```
User chọn QR → Tạo đơn hàng (pending) → Hiển thị QR Code
                                      → Countdown 60 phút
                                      → Polling mỗi 5s

Nếu thanh toán thành công:
  SePay webhook → Parse DH<id> → Verify amount → Status: approved → Email thông báo

Nếu hết 60 phút:
  Cron job → Status: cancelled
```

## API Endpoints

### Create Order
```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "piano_id": 1,
  "type": "buy", // or "rent"
  "payment_method": "QR", // or "COD"
  "rental_start_date": "2026-02-15", // optional, for rent
  "rental_end_date": "2026-02-20"    // optional, for rent
}

Response (QR):
{
  "success": true,
  "message": "Đơn hàng đã tạo. Vui lòng thanh toán trong 60 phút.",
  "data": {
    "id": 15,
    "status": "pending",
    "payment_method": "QR",
    "payment_expired_at": "2026-02-11T13:00:00.000Z",
    "qr_url": "https://qr.sepay.vn/img?bank=MB&acc=0365408910&template=compact&amount=50000000&des=DH15",
    "bank_info": {
      "bank_name": "MB",
      "account_number": "0365408910",
      "account_name": "XPIANO",
      "amount": 50000000,
      "description": "DH15"
    }
  }
}
```

### Check Order Status (Polling)
```http
GET /api/orders/:id/status
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": 15,
    "status": "pending", // or "approved", "cancelled"
    "payment_method": "QR",
    "payment_expired_at": "2026-02-11T13:00:00.000Z",
    "paid_at": null,
    "transaction_code": null,
    "is_expired": false
  }
}
```

### SePay Webhook
```http
POST /api/sepay-webhook
Content-Type: application/json

{
  "id": 123456,
  "gateway": "MBBank",
  "transactionDate": "2026-02-11 12:30:00",
  "accountNumber": "0365408910",
  "content": "DH15 thanh toan don hang",
  "transferType": "in",
  "transferAmount": 50000000,
  "referenceCode": "FT26042ABCDE"
}
```

## Testing

### Test QR URL
Truy cập URL sau để kiểm tra QR Code:
```
https://qr.sepay.vn/img?bank=MB&acc=0365408910&template=compact&amount=10000&des=DH999
```

### Test Webhook (Local)
Sử dụng curl hoặc Postman:
```bash
curl -X POST http://localhost:5000/api/sepay-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "content": "DH15 thanh toan don hang",
    "transferType": "in",
    "transferAmount": 50000000,
    "referenceCode": "TEST123"
  }'
```

## Lưu ý bảo mật

1. **Webhook Security**: SePay webhook không có signature verification mặc định. Cân nhắc thêm IP whitelist hoặc secret token nếu cần.

2. **Amount Validation**: Hệ thống đã kiểm tra số tiền chuyển khoản phải >= số tiền đơn hàng.

3. **Idempotency**: Webhook handler kiểm tra status trước khi xử lý để tránh xử lý trùng lặp.

## Troubleshooting

### Webhook không nhận được
- Kiểm tra URL webhook trong SePay dashboard
- Kiểm tra firewall/CORS settings
- Xem logs: `console.log('📥 SePay Webhook received:', ...)`

### QR Code không hiển thị
- Kiểm tra biến môi trường BANK_ACCOUNT, BANK_NAME
- Verify URL format: `https://qr.sepay.vn/img?bank=...`

### Đơn hàng không tự động approved
- Kiểm tra nội dung chuyển khoản có đúng format `DH<id>` không
- Kiểm tra số tiền chuyển khoản có đủ không
- Xem logs webhook để debug
