const { supabase } = require('../utils/supabaseClient');

class FavoriteController {
    // GET /api/favorites - Get all favorites for current user
    static async getMyFavorites(req, res) {
        try {
            const supabase = getSupabaseClient(req);
            const user = req.user;

            const { data, error } = await supabase
                .from('favorites')
                .select(`
                    *,
                    piano:pianos(id, name, image_url, category, price_per_hour, rating)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            res.status(200).json({
                success: true,
                count: data.length,
                data: data
            });
        } catch (error) {
            console.error('Error in getMyFavorites:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách yêu thích',
                error: error.message
            });
        }
    }

    // GET /api/favorites/check/:pianoId - Check if piano is favored
    static async checkFavorite(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global supabase for Service Role access
            const user = req.user;
            const { pianoId } = req.params;

            const { data, error } = await supabase
                .from('favorites')
                .select('id')
                .eq('user_id', user.id)
                .eq('piano_id', pianoId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            res.status(200).json({
                success: true,
                isFavorited: !!data
            });
        } catch (error) {
            console.error('Error in checkFavorite:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra yêu thích',
                error: error.message
            });
        }
    }

    // POST /api/favorites/:pianoId - Add to favorites
    static async addFavorite(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global supabase for Service Role access
            const user = req.user;
            const { pianoId } = req.params;

            const { error } = await supabase
                .from('favorites')
                .insert({
                    user_id: user.id,
                    piano_id: pianoId
                });

            if (error) {
                if (error.code === '23505') { // Unique constraint violation
                    return res.status(409).json({
                        success: false,
                        message: 'Đàn này đã có trong danh sách yêu thích'
                    });
                }
                throw error;
            }

            res.status(201).json({
                success: true,
                message: 'Đã thêm vào danh sách yêu thích'
            });
        } catch (error) {
            console.error('Error in addFavorite:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi thêm yêu thích',
                error: error.message
            });
        }
    }

    // DELETE /api/favorites/:pianoId - Remove from favorites
    static async removeFavorite(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global supabase for Service Role access
            const user = req.user;
            const { pianoId } = req.params;

            const { error } = await supabase
                .from('favorites')
                .delete()
                .eq('user_id', user.id)
                .eq('piano_id', pianoId);

            if (error) {
                throw error;
            }

            res.status(200).json({
                success: true,
                message: 'Đã xóa khỏi danh sách yêu thích'
            });
        } catch (error) {
            console.error('Error in removeFavorite:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa yêu thích',
                error: error.message
            });
        }
    }

    // GET /api/favorites/count/:pianoId
    static async getFavoriteCount(req, res) {
        try {
            // const supabase = getSupabaseClient(req); // Use global supabase for Service Role access
            const { pianoId } = req.params;
            const { count, error } = await supabase
                .from('favorites')
                .select('*', { count: 'exact', head: true })
                .eq('piano_id', pianoId);

            if (error) throw error;

            res.status(200).json({
                success: true,
                count: count || 0
            });
        } catch (error) {
            console.error('Error getting count:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy số lượng yêu thích',
                error: error.message
            });
        }
    }
}

module.exports = FavoriteController;
