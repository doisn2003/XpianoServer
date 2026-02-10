const { supabase, supabaseAdmin } = require('../utils/supabaseClient');

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

    // POST /api/orders
    static async createOrder(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global for Service Role
            const user = req.user;
            const { piano_id, type, rental_start_date, rental_end_date } = req.body;

            // 1. Get piano details (Use supabaseAdmin to bypass RLS)
            const { data: piano, error: pianoError } = await supabaseAdmin
                .from('pianos')
                .select('price_per_day, price')
                .eq('id', piano_id)
                .single();

            if (pianoError || !piano) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đàn'
                });
            }

            // 2. Calculate price and days
            let totalPrice;
            let rentalDays = null;

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

            // 3. Create Order (Use supabaseAdmin to bypass RLS)
            const { data: order, error } = await supabaseAdmin
                .from('orders')
                .insert({
                    user_id: user.id,
                    piano_id,
                    type,
                    total_price: totalPrice,
                    rental_start_date: rental_start_date || null,
                    rental_end_date: rental_end_date || null,
                    rental_days: rentalDays,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;

            res.status(201).json({
                success: true,
                message: 'Đặt hàng thành công',
                data: order
            });

        } catch (error) {
            console.error('Error in createOrder:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo đơn hàng',
                error: error.message
            });
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
                    piano:pianos(id, name, image_url, category)
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
                    piano:pianos(id, name, image_url, category)
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
            // const supabase = getSupabaseClient(req); // Use global for Service Role
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

            const { error } = await supabaseAdmin
                .from('orders')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            res.status(200).json({
                success: true,
                message: `Đã cập nhật trạng thái đơn hàng thành ${status}`
            });

        } catch (error) {
            console.error('Error in updateOrderStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật trạng thái đơn hàng',
                error: error.message
            });
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
}

module.exports = OrderController;
