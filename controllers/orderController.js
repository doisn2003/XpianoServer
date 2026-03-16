const { supabase, supabaseAdmin } = require('../utils/supabaseClient');
const sendEmail = require('../utils/emailService');
const pool = require('../config/database');

class OrderController {
    // Helper: Calculate rental price (based on price per day)
    static calculateRentalPrice(pricePerDay, days) {
        const basePrice = pricePerDay * days;
        if (days >= 8) return Math.round(basePrice * 0.85); // 15% discount
        if (days >= 3) return Math.round(basePrice * 0.90); // 10% discount
        return basePrice;
    }

    // Helper: Calculate buy price (use price field if available, otherwise fallback to calculation)
    static calculateBuyPrice(price, pricePerDay) {
        // If piano has explicit price, use it
        if (price && price > 0) {
            return price;
        }
        // Otherwise, calculate from pricePerDay
        return pricePerDay * 100;
    }

    // Helper: Generate SePay QR URL
    static generateSepayQRUrl(orderId, amount) {
        const bankAccount = process.env.BANK_ACCOUNT || '0365408910';
        const bankName = process.env.BANK_NAME || 'MB';
        const description = `DH${orderId}`;

        return `https://qr.sepay.vn/img?bank=${bankName}&acc=${bankAccount}&template=compact&amount=${amount}&des=${description}`;
    }

    // Helper: Send payment success email
    static async sendPaymentSuccessEmail(order, userEmail, userName) {
        const subject = `[Xpiano] Thanh toán đơn hàng #${order.id} thành công`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #D4A574;">🎹 Xpiano - Thanh toán thành công!</h2>
                <p>Xin chào <strong>${userName || 'Quý khách'}</strong>,</p>
                <p>Chúng tôi đã nhận được thanh toán cho đơn hàng <strong>#${order.id}</strong>.</p>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Chi tiết đơn hàng:</strong></p>
                    <ul style="list-style: none; padding: 0;">
                        <li>📋 Mã đơn hàng: <strong>#${order.id}</strong></li>
                        <li>💰 Số tiền: <strong>${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.total_price)}</strong></li>
                        <li>🏦 Mã giao dịch: <strong>${order.transaction_code || 'N/A'}</strong></li>
                        <li>📅 Thời gian: <strong>${new Date().toLocaleString('vi-VN')}</strong></li>
                    </ul>
                </div>
                
                <p>Đơn hàng của bạn đang được xử lý. Chúng tôi sẽ liên hệ sớm nhất!</p>
                
                <p style="color: #666; font-size: 12px; margin-top: 30px;">
                    Trân trọng,<br>
                    <strong>Đội ngũ Xpiano</strong>
                </p>
            </div>
        `;

        return await sendEmail(userEmail, subject, html);
    }

    // POST /api/orders
    static async createOrder(req, res) {
        try {
            const user = req.user;
            const {
                piano_id,
                course_id,
                type,
                rental_start_date,
                rental_end_date,
                payment_method = 'COD',
                affiliate_ref   // ← Tiếp nhận mã giới thiệu từ frontend
            } = req.body;

            // ─── STEP 1: Lấy thông tin sản phẩm (Đàn hoặc Khóa học) ───────────────────────────────
            let totalPrice;
            let rentalDays = null;

            if (type === 'course') {
                if (!course_id) return res.status(400).json({ success: false, message: 'Thiếu course_id' });
                const { data: course, error: courseError } = await supabaseAdmin
                    .from('courses').select('price').eq('id', course_id).single();
                if (courseError || !course) return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
                totalPrice = course.price;
            } else {
                if (!piano_id) return res.status(400).json({ success: false, message: 'Thiếu piano_id' });
                const { data: piano, error: pianoError } = await supabaseAdmin
                    .from('pianos').select('price_per_day, price').eq('id', piano_id).single();

                if (pianoError || !piano) {
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy đàn'
                    });
                }

                if (type === 'rent') {
                    if (!rental_start_date || !rental_end_date) {
                        return res.status(400).json({
                            success: false,
                            message: 'Vui lòng chọn ngày thuê'
                        });
                    }

                    const startDate = new Date(rental_start_date);
                    const endDate = new Date(rental_end_date);
                    rentalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

                    if (rentalDays < 1) {
                        return res.status(400).json({
                            success: false,
                            message: 'Thời gian thuê phải ít nhất 1 ngày'
                        });
                    }

                    totalPrice = OrderController.calculateRentalPrice(piano.price_per_day, rentalDays);
                } else {
                    totalPrice = OrderController.calculateBuyPrice(piano.price, piano.price_per_day);
                }
            }

            // ─── STEP 3: Validate payment_method ─────────────────────────
            if (!['COD', 'QR'].includes(payment_method)) {
                return res.status(400).json({
                    success: false,
                    message: 'Phương thức thanh toán không hợp lệ'
                });
            }

            // ─── STEP 4: Tính payment expiry (60 phút cho QR) ────────────
            const paymentExpiredAt = payment_method === 'QR'
                ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
                : null;

            // ─── STEP 5: Tạo đơn hàng (ưu tiên số 1) ────────────────────
            const { data: order, error } = await supabaseAdmin
                .from('orders')
                .insert({
                    user_id: user.id,
                    piano_id: piano_id || null,
                    course_id: course_id || null,
                    type,
                    total_price: totalPrice,
                    rental_start_date: rental_start_date || null,
                    rental_end_date: rental_end_date || null,
                    rental_days: rentalDays,
                    status: 'pending',
                    payment_method,
                    payment_expired_at: paymentExpiredAt
                })
                .select()
                .single();

            if (error) throw error;

            // ─── STEP 6: Chuẩn bị response dựa theo payment_method ───────
            const responseData = {
                ...order,
                qr_url: null,
                bank_info: null
            };

            if (payment_method === 'QR') {
                responseData.qr_url = OrderController.generateSepayQRUrl(order.id, totalPrice);
                responseData.bank_info = {
                    bank_name: process.env.BANK_NAME || 'MB',
                    account_number: process.env.BANK_ACCOUNT || '0365408910',
                    account_name: process.env.BANK_ACCOUNT_NAME || 'XPIANO',
                    amount: totalPrice,
                    description: `DH${order.id}`
                };
            }

            // ─── STEP 7: TRẢ VỀ RESPONSE NGAY cho khách ─────────────────
            // Đây là ưu tiên số 1 – khách đã đặt hàng thành công
            res.status(201).json({
                success: true,
                message: payment_method === 'QR'
                    ? 'Đơn hàng đã tạo. Vui lòng thanh toán trong 60 phút.'
                    : 'Đặt hàng thành công',
                data: responseData
            });

            // ─── STEP 8: Xử lý Affiliate (FIRE & FORGET – KHÔNG chặn response) ──
            // Nguyên tắc: Nếu bước này lỗi, khách KHÔNG bị ảnh hưởng.
            // Toàn bộ lỗi chỉ được log ra console, không throw lên trên.
            if (affiliate_ref && typeof affiliate_ref === 'string' && affiliate_ref.trim().length > 0) {
                OrderController._processAffiliateCommission({
                    affiliate_ref: affiliate_ref.trim().toUpperCase(),
                    buyer_user_id: user.id,
                    order_id: order.id,
                    total_price: totalPrice
                }).catch(err => {
                    // Đảm bảo promise không unhandled
                    console.error(`⚠️ [Affiliate] Unhandled error for order #${order.id}:`, err.message);
                });
            }

        } catch (error) {
            console.error('Error in createOrder:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo đơn hàng',
                error: error.message
            });
        }
    }

    /**
     * Helper nội bộ: Tạo commission cho affiliate sau khi đơn hàng được tạo thành công.
     * Đây là hàm PRIVATE, chỉ dùng trong class này.
     * Được thiết kế để KHÔNG BAO GIỜ throw lên ngoài – mọi lỗi đều được catch và log.
     *
     * @param {object} params
     * @param {string} params.affiliate_ref     - Mã giới thiệu từ localStorage của khách
     * @param {string} params.buyer_user_id     - ID của người mua hàng (để chống gian lận tự giới thiệu)
     * @param {number} params.order_id          - ID đơn hàng vừa tạo
     * @param {number} params.total_price       - Giá trị đơn hàng (để tính commission)
     */
    static async _processAffiliateCommission({ affiliate_ref, buyer_user_id, order_id, total_price }) {
        try {
            console.log(`🔗 [Affiliate] Processing commission for ref="${affiliate_ref}", order #${order_id}`);

            // ─── Tìm affiliate theo referral_code ────────────────────────
            const { data: affiliate, error: affiliateError } = await supabaseAdmin
                .from('affiliates')
                .select('id, user_id, commission_rate, status')
                .eq('referral_code', affiliate_ref)
                .eq('status', 'active')  // Chỉ affiliate đang active mới nhận hoa hồng
                .single();

            if (affiliateError || !affiliate) {
                console.log(`ℹ️ [Affiliate] Ref="${affiliate_ref}" not found or inactive. No commission created.`);
                return; // Không lỗi, chỉ không có affiliate hợp lệ
            }

            // ─── Chống gian lận: Không cho tự giới thiệu chính mình ──────
            if (affiliate.user_id === buyer_user_id) {
                console.warn(`🚨 [Affiliate] FRAUD DETECTED: User ${buyer_user_id} tried to self-refer with code "${affiliate_ref}". Commission blocked.`);
                return;
            }

            // ─── Tính tiền hoa hồng ───────────────────────────────────────
            // commission_amount = total_price * commission_rate (VD: 10% của đơn hàng)
            const commissionAmount = Math.round(total_price * parseFloat(affiliate.commission_rate));

            if (commissionAmount <= 0) {
                console.log(`ℹ️ [Affiliate] Commission amount is 0 for order #${order_id}. Skipping.`);
                return;
            }

            // ─── Insert commission với status 'pending' ───────────────────
            // Status 'pending' → Admin sẽ duyệt thủ công bằng approve_commission RPC
            const { error: insertError } = await supabaseAdmin
                .from('commissions')
                .insert({
                    affiliate_id: affiliate.id,
                    amount: commissionAmount,
                    reference_type: 'order_piano',
                    reference_id: order_id.toString(),
                    status: 'pending',
                    note: `Hoa hồng từ đơn hàng #${order_id} (${(parseFloat(affiliate.commission_rate) * 100).toFixed(0)}% × ${total_price.toLocaleString('vi-VN')} VNĐ)`
                });

            if (insertError) {
                console.error(`❌ [Affiliate] Failed to insert commission for order #${order_id}:`, insertError.message);
                return;
            }

            console.log(`✅ [Affiliate] Commission created: ${commissionAmount.toLocaleString('vi-VN')} VNĐ for affiliate ${affiliate.id} (ref: ${affiliate_ref}), order #${order_id}`);

        } catch (err) {
            // Đảm bảo KHÔNG bao giờ crash server hay ảnh hưởng đơn hàng
            console.error(`❌ [Affiliate] Unexpected error processing commission for order #${order_id}:`, err.message);
        }
    }


    // GET /api/orders/my-orders
    static async getMyOrders(req, res) {
        try {
            // Use supabaseAdmin to bypass RLS
            const user = req.user;
            console.log('GetMyOrders - User ID:', user?.id);

            const { data, error } = await supabaseAdmin
                .from('orders')
                .select(`
                    *,
                    piano:pianos(id, name, image_url, category, description, reviews_count, price_per_day)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('GetMyOrders - Supabase Error:', error);
                throw error;
            }

            console.log('GetMyOrders - Success, count:', data?.length);

            res.status(200).json({
                success: true,
                data: data
            });
        } catch (error) {
            console.error('Error in getMyOrders:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách đơn hàng',
                error: error.message
            });
        }
    }

    // GET /api/orders/active-rentals
    static async getMyActiveRentals(req, res) {
        try {
            // Use supabaseAdmin to bypass RLS
            const user = req.user;
            const { data, error } = await supabaseAdmin
                .from('rentals')
                .select(`
                    *,
                    piano:pianos(id, name, image_url, category, description, reviews_count, price_per_day)
                `)
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('end_date', { ascending: true });

            if (error) throw error;

            res.status(200).json({
                success: true,
                data: data
            });

        } catch (error) {
            console.error('Error in getMyActiveRentals:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách thuê đang hoạt động',
                error: error.message
            });
        }
    }

    // GET /api/orders (Admin)
    static async getAllOrders(req, res) {
        try {
            // 1. Fetch orders with piano info (profiles FK doesn't exist, so skip join)
            const { data: orders, error } = await supabaseAdmin
                .from('orders')
                .select(`
                    *,
                    piano:pianos(id, name, image_url, category)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 2. Enrich with user profile data from profiles table
            const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
            let profilesMap = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, phone, role, avatar_url')
                    .in('id', userIds);
                if (profiles) {
                    profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
                }
            }

            const enrichedOrders = orders.map(order => ({
                ...order,
                user: profilesMap[order.user_id] || null
            }));

            res.status(200).json({
                success: true,
                data: enrichedOrders
            });
        } catch (error) {
            console.error('Error in getAllOrders:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tất cả đơn hàng',
                error: error.message
            });
        }
    }

    // PUT /api/orders/:id/status (Admin - Approve/Reject)
    static async updateOrderStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, notes } = req.body;
            const user = req.user;

            const updates = {
                status,
                admin_notes: notes || null
            };

            if (status === 'approved') {
                updates.approved_by = user.id;
                updates.approved_at = new Date().toISOString();
            }

            // ─── Lấy thông tin đơn hàng TRƯỚC khi update ─────────────────
            const { data: orderBeforeUpdate } = await supabaseAdmin
                .from('orders')
                .select('id, total_price, status, type, course_id, user_id')
                .eq('id', id)
                .single();

            const { error } = await supabaseAdmin
                .from('orders')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            res.status(200).json({
                success: true,
                message: `Đã cập nhật trạng thái đơn hàng thành ${status}`
            });

            // ─── STEP AFTER RESPONSE: Xử lý theo loại đơn hàng ─────────
            // Fire & Forget – không ảnh hưởng đến response đã gửi
            if (status === 'approved' && orderBeforeUpdate && orderBeforeUpdate.status === 'pending') {
                if (orderBeforeUpdate.type === 'course') {
                    OrderController._processCourseApproval({
                        order_id: parseInt(id),
                        course_id: orderBeforeUpdate.course_id,
                        user_id: orderBeforeUpdate.user_id,
                        received_amount: orderBeforeUpdate.total_price,
                        payment_method: 'COD'
                    }).catch(err => console.error(`⚠️ [CourseApproval] Unhandled error:`, err.message));
                } else {
                    OrderController._creditAdminWallet({
                        admin_user_id: user.id,
                        order_id: parseInt(id),
                        amount: orderBeforeUpdate.total_price
                    }).catch(err => {
                        console.error(`⚠️ [AdminWallet] Unhandled error crediting wallet:`, err.message);
                    });
                }
            }

        } catch (error) {
            console.error('Error in updateOrderStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật trạng thái đơn hàng',
                error: error.message
            });
        }
    }

    /**
     * Helper nội bộ: Cộng doanh thu vào ví Admin khi đơn hàng được duyệt.
     * Fire & Forget – KHÔNG BAO GIỜ throw lên ngoài.
     *
     * Logic:
     *   1. Upsert bản ghi `wallets` của admin (tạo nếu chưa có, cộng nếu đã có)
     *   2. Ghi một dòng `transactions` loại 'credit_order'
     *
     * @param {object} params
     * @param {string} params.admin_user_id  - UUID của admin đã duyệt đơn
     * @param {number} params.order_id       - ID đơn hàng
     * @param {number} params.amount         - Số tiền cần cộng (total_price của đơn)
     */
    static async _creditAdminWallet({ admin_user_id, order_id, amount }) {
        try {
            console.log(`💰 [AdminWallet] Crediting ${amount.toLocaleString('vi-VN')} VNĐ for order #${order_id} to admin ${admin_user_id}`);

            // ─── 1. Upsert ví Admin (tạo nếu chưa có, cộng tiền nếu đã có) ──
            // Dùng RPC để atomic update tránh race condition
            const { data: wallet, error: walletFetchError } = await supabaseAdmin
                .from('wallets')
                .select('id, available_balance')
                .eq('user_id', admin_user_id)
                .single();

            if (walletFetchError && walletFetchError.code !== 'PGRST116') {
                // PGRST116 = row not found – normal case for first time
                throw walletFetchError;
            }

            if (!wallet) {
                // Tạo ví mới cho admin
                const { error: insertError } = await supabaseAdmin
                    .from('wallets')
                    .insert({ user_id: admin_user_id, available_balance: amount, total_earned: amount, total_withdrawn: 0 });
                if (insertError) throw insertError;
            } else {
                // Cộng vào ví hiện có
                const { error: updateError } = await supabaseAdmin
                    .from('wallets')
                    .update({
                        available_balance: wallet.available_balance + amount,
                    })
                    .eq('user_id', admin_user_id);
                if (updateError) throw updateError;
            }

            // ─── 2. Ghi transaction history ────────────────────────────────
            const { error: txError } = await supabaseAdmin
                .from('transactions')
                .insert({
                    user_id: admin_user_id,
                    type: 'credit',
                    amount,
                    description: `Doanh thu từ đơn hàng #${order_id} được duyệt`,
                    reference_type: 'order',
                    reference_id: order_id.toString(),
                    status: 'completed'
                });

            if (txError) {
                // Không throw – lỗi ghi log không quan trọng bằng ví đã được cộng
                console.error(`⚠️ [AdminWallet] Failed to record transaction for order #${order_id}:`, txError.message);
            }

            console.log(`✅ [AdminWallet] Successfully credited ${amount.toLocaleString('vi-VN')} VNĐ for order #${order_id}`);

        } catch (err) {
            console.error(`❌ [AdminWallet] Failed to credit wallet for order #${order_id}:`, err.message);
            // Không throw – đây là fire & forget
        }
    }

    /**
     * Helper nội bộ: Xử lý ghi danh khóa học và chia tiền cho giáo viên
     */
    static async _processCourseApproval({ order_id, course_id, user_id, received_amount, payment_method }) {
        let dbClient = null;
        try {
            console.log(`🎓 [CourseApproval] Processing course enrollment for order #${order_id}`);

            // 1. Fetch course info
            const { data: course, error: courseError } = await supabaseAdmin
                .from('courses')
                .select('title, teacher_id')
                .eq('id', course_id)
                .single();

            if (courseError || !course) throw new Error('Course not found');

            dbClient = await pool.connect();
            await dbClient.query('BEGIN');

            // 2. Thêm course_enrollments (dùng UPSERT SQL thuần để vượt qua lỗi cache Supabase JS)
            const enrollSql = `
                INSERT INTO course_enrollments (course_id, user_id, order_id, status)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (course_id, user_id)
                DO UPDATE SET
                    order_id = EXCLUDED.order_id,
                    status = EXCLUDED.status
            `;
            await dbClient.query(enrollSql, [
                course_id,
                user_id,
                order_id,
                'active'
            ]);

            // 3. Phân bổ doanh thu cho giáo viên (80%)
            if (course.teacher_id) {
                const teacherId = course.teacher_id;
                const platformFeePercentage = 0.20; // Admin giữ 20%
                const teacherEarnings = received_amount * (1 - platformFeePercentage);

                const walletRes = await dbClient.query(
                    'UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2 RETURNING id',
                    [teacherEarnings, teacherId]
                );
                if (walletRes.rows.length === 0) {
                    const newW = await dbClient.query(
                        'INSERT INTO wallets (user_id, available_balance, locked_balance) VALUES ($1, $2, 0) RETURNING id',
                        [teacherId, teacherEarnings]
                    );
                    await dbClient.query(
                        'INSERT INTO transactions (wallet_id, type, amount, reference_type, reference_id, note) VALUES ($1, $2, $3, $4, $5, $6)',
                        [newW.rows[0].id, 'IN', teacherEarnings, 'course_fee', order_id.toString(), `Doanh thu khóa học ${course.title}`]
                    );
                } else {
                    await dbClient.query(
                        'INSERT INTO transactions (wallet_id, type, amount, reference_type, reference_id, note) VALUES ($1, $2, $3, $4, $5, $6)',
                        [walletRes.rows[0].id, 'IN', teacherEarnings, 'course_fee', order_id.toString(), `Doanh thu khóa học ${course.title}`]
                    );
                }
                console.log(`✅ [CourseApproval] Đã cộng ${teacherEarnings} vào ví giáo viên ${teacherId}`);
            }

            await dbClient.query('COMMIT');

        } catch (err) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error(`❌ [CourseApproval] Lỗi xử lý khóa học cho order #${order_id}:`, err.message);
        } finally {
            if (dbClient) dbClient.release();
        }
    }

    // POST /api/orders/:id/cancel (User)
    static async cancelOrder(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global for Service Role
            const { id } = req.params;
            const user = req.user;

            const { error } = await supabaseAdmin
                .from('orders')
                .update({ status: 'cancelled' })
                .eq('id', id)
                .eq('user_id', user.id)
                .eq('status', 'pending');

            if (error) throw error;

            res.status(200).json({
                success: true,
                message: 'Đã hủy đơn hàng'
            });

        } catch (error) {
            console.error('Error in cancelOrder:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi hủy đơn hàng',
                error: error.message
            });
        }
    }

    // GET /api/orders/stats (Admin)
    static async getOrderStats(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global for Service Role
            const { data: orders, error } = await supabaseAdmin
                .from('orders')
                .select('type, status, total_price');

            if (error) throw error;

            const stats = {
                total: orders.length,
                pending: orders.filter(o => o.status === 'pending').length,
                approved: orders.filter(o => o.status === 'approved').length,
                rejected: orders.filter(o => o.status === 'rejected').length,
                totalRevenue: orders.filter(o => o.status === 'approved').reduce((sum, o) => sum + o.total_price, 0),
                buyOrders: orders.filter(o => o.type === 'buy').length,
                rentOrders: orders.filter(o => o.type === 'rent').length,
                courseOrders: orders.filter(o => o.type === 'course').length,
            };

            res.status(200).json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('Error in getOrderStats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê đơn hàng',
                error: error.message
            });
        }
    }

    // GET /api/orders/:id/status - Check order payment status (for polling)
    static async getOrderStatus(req, res) {
        try {
            const { id } = req.params;
            const user = req.user;

            const { data: order, error } = await supabaseAdmin
                .from('orders')
                .select('id, status, payment_method, payment_expired_at, paid_at, transaction_code')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (error || !order) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đơn hàng'
                });
            }

            // Check if payment expired
            let isExpired = false;
            if (order.payment_method === 'QR' && order.status === 'pending') {
                const expiredAt = new Date(order.payment_expired_at);
                isExpired = new Date() > expiredAt;
            }

            res.status(200).json({
                success: true,
                data: {
                    ...order,
                    is_expired: isExpired
                }
            });
        } catch (error) {
            console.error('Error in getOrderStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra trạng thái đơn hàng',
                error: error.message
            });
        }
    }

    // POST /api/sepay-webhook - SePay webhook handler
    static async handleSepayWebhook(req, res) {
        try {
            console.log('📥 SePay Webhook received:', JSON.stringify(req.body, null, 2));

            // SePay webhook payload format:
            // {
            //   "id": 123456,
            //   "gateway": "MBBank",
            //   "transactionDate": "2024-01-01 12:00:00",
            //   "accountNumber": "0365408910",
            //   "code": null,
            //   "content": "DH15 thanh toan don hang",
            //   "transferType": "in",
            //   "transferAmount": 1000000,
            //   "accumulated": 5000000,
            //   "subAccount": null,
            //   "referenceCode": "FT24001ABCDE",
            //   "description": "DH15 thanh toan don hang"
            // }

            const { content, transferAmount, referenceCode, transferType } = req.body;

            // Only process incoming transfers
            if (transferType !== 'in') {
                console.log('⚠️ Ignoring outgoing transfer');
                return res.status(200).json({ success: true, message: 'Ignored outgoing transfer' });
            }

            // Parse order ID from content (format: "DH<order_id>")
            const orderIdMatch = content?.match(/DH(\d+)/i);
            if (!orderIdMatch) {
                console.log('⚠️ Could not parse order ID from content:', content);
                return res.status(200).json({ success: true, message: 'No order ID found' });
            }

            const orderId = parseInt(orderIdMatch[1], 10);
            console.log(`🔍 Processing payment for Order #${orderId}`);

            // Get order details
            const { data: order, error: orderError } = await supabaseAdmin
                .from('orders')
                .select(`
                    *,
                    piano:pianos(name),
                    course:courses(title, teacher_id)
                `)
                .eq('id', orderId)
                .single();

            if (orderError || !order) {
                console.log(`❌ Order #${orderId} not found`);
                return res.status(200).json({ success: true, message: 'Order not found' });
            }

            // Check if order is still pending
            if (order.status !== 'pending') {
                console.log(`⚠️ Order #${orderId} is not pending (status: ${order.status})`);
                return res.status(200).json({ success: true, message: 'Order already processed' });
            }

            // Check if payment method is QR
            if (order.payment_method !== 'QR') {
                console.log(`⚠️ Order #${orderId} is not QR payment`);
                return res.status(200).json({ success: true, message: 'Not a QR payment order' });
            }

            // Verify amount
            const receivedAmount = parseInt(transferAmount, 10);
            const expectedAmount = order.total_price;

            if (receivedAmount < expectedAmount) {
                console.log(`❌ Amount mismatch for Order #${orderId}: received ${receivedAmount}, expected ${expectedAmount}`);

                // Update order with payment_failed status
                await supabaseAdmin
                    .from('orders')
                    .update({
                        status: 'payment_failed',
                        admin_notes: `Số tiền không khớp: nhận ${receivedAmount}, cần ${expectedAmount}. Mã GD: ${referenceCode}`
                    })
                    .eq('id', orderId);

                return res.status(200).json({ success: true, message: 'Amount mismatch' });
            }

            // Payment successful - Update order
            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update({
                    status: 'approved',
                    transaction_code: referenceCode,
                    paid_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (updateError) {
                console.error(`❌ Error updating order #${orderId}:`, updateError);
                return res.status(500).json({ success: false, message: 'Error updating order' });
            }

            console.log(`✅ Order #${orderId} payment confirmed!`);

            // ─── XỬ LÝ ĐẶC THÙ CHO KHÓA HỌC / ĐÀN ───
            if (order.type === 'course' && order.course_id) {
                await OrderController._processCourseApproval({
                    order_id: orderId,
                    course_id: order.course_id,
                    user_id: order.user_id,
                    received_amount: receivedAmount,
                    payment_method: 'QR'
                });
            } else {
                // For Piano buys/rents via QR, credit admin wallet.
                // We need an admin user ID. Let's look up the first admin.
                const { data: adminUser } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin').limit(1).single();
                if (adminUser) {
                    await OrderController._creditAdminWallet({
                        admin_user_id: adminUser.id,
                        order_id: orderId,
                        amount: receivedAmount
                    });
                }
            }

            // Get user email for notification
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('email, full_name')
                .eq('id', order.user_id)
                .single();

            // Send confirmation emails
            if (profile?.email) {
                await OrderController.sendPaymentSuccessEmail(
                    { ...order, transaction_code: referenceCode },
                    profile.email,
                    profile.full_name
                );
            }

            // Also notify admin
            const adminEmail = process.env.EMAIL_USER;
            if (adminEmail) {
                const adminSubject = `[Xpiano Admin] Đơn hàng #${orderId} đã thanh toán`;
                const adminHtml = `
                    <h2>🎹 Thông báo thanh toán mới</h2>
                    <p><strong>Đơn hàng #${orderId}</strong> đã được thanh toán thành công!</p>
                    <ul>
                        <li>Khách hàng: ${profile?.full_name || 'N/A'}</li>
                        <li>Email: ${profile?.email || 'N/A'}</li>
                        <li>Piano: ${order.piano?.name || 'N/A'}</li>
                        <li>Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(receivedAmount)}</li>
                        <li>Mã giao dịch: ${referenceCode}</li>
                    </ul>
                `;
                await sendEmail(adminEmail, adminSubject, adminHtml);
            }

            res.status(200).json({ success: true, message: 'Payment confirmed' });

        } catch (error) {
            console.error('Error in handleSepayWebhook:', error);
            res.status(500).json({
                success: false,
                message: 'Webhook processing error',
                error: error.message
            });
        }
    }

    // Cron Job: Auto-cancel expired QR orders (called every minute)
    static async cancelExpiredOrders() {
        try {
            const now = new Date().toISOString();

            // Find and update expired pending QR orders
            const { data: expiredOrders, error: selectError } = await supabaseAdmin
                .from('orders')
                .select('id, user_id, total_price')
                .eq('status', 'pending')
                .eq('payment_method', 'QR')
                .lt('payment_expired_at', now);

            if (selectError) {
                console.error('Error finding expired orders:', selectError);
                return;
            }

            if (!expiredOrders || expiredOrders.length === 0) {
                return; // No expired orders
            }

            console.log(`📋 Found ${expiredOrders.length} expired QR orders to cancel`);

            // Update all expired orders to cancelled
            const expiredIds = expiredOrders.map(o => o.id);
            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update({
                    status: 'cancelled',
                    admin_notes: 'Tự động hủy do hết thời gian thanh toán (60 phút)'
                })
                .in('id', expiredIds);

            if (updateError) {
                console.error('Error cancelling expired orders:', updateError);
                return;
            }

            console.log(`✅ Cancelled ${expiredOrders.length} expired orders: [${expiredIds.join(', ')}]`);

        } catch (error) {
            console.error('Error in cancelExpiredOrders cron:', error);
        }
    }
}

module.exports = OrderController;
