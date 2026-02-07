const PianoModel = require('../models/pianoModel');

class PianoController {
    // GET /api/pianos - Get all pianos
    static async getAllPianos(req, res) {
        try {
            const filters = {
                category: req.query.category,
                minRating: req.query.minRating,
                maxPrice: req.query.maxPrice
            };

            const pianos = await PianoModel.findAll(filters);

            res.status(200).json({
                success: true,
                count: pianos.length,
                data: pianos
            });
        } catch (error) {
            console.error('Error in getAllPianos:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách đàn piano',
                error: error.message
            });
        }
    }

    // GET /api/pianos/:id - Get piano by ID
    static async getPianoById(req, res) {
        try {
            const { id } = req.params;
            const piano = await PianoModel.findById(id);

            if (!piano) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đàn piano'
                });
            }

            res.status(200).json({
                success: true,
                data: piano
            });
        } catch (error) {
            console.error('Error in getPianoById:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin đàn piano',
                error: error.message
            });
        }
    }

    // POST /api/pianos - Create new piano
    static async createPiano(req, res) {
        try {
            const pianoData = req.body;

            // Validation
            if (!pianoData.name || !pianoData.category) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên và loại đàn là bắt buộc'
                });
            }

            const newPiano = await PianoModel.create(pianoData);

            res.status(201).json({
                success: true,
                message: 'Tạo đàn piano thành công',
                data: newPiano
            });
        } catch (error) {
            console.error('Error in createPiano:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo đàn piano',
                error: error.message
            });
        }
    }

    // PUT /api/pianos/:id - Update piano
    static async updatePiano(req, res) {
        try {
            const { id } = req.params;
            const pianoData = req.body;

            const updatedPiano = await PianoModel.update(id, pianoData);

            if (!updatedPiano) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đàn piano để cập nhật'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Cập nhật đàn piano thành công',
                data: updatedPiano
            });
        } catch (error) {
            console.error('Error in updatePiano:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật đàn piano',
                error: error.message
            });
        }
    }

    // DELETE /api/pianos/:id - Delete piano
    static async deletePiano(req, res) {
        try {
            const { id } = req.params;
            const deletedPiano = await PianoModel.delete(id);

            if (!deletedPiano) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đàn piano để xóa'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Xóa đàn piano thành công',
                data: deletedPiano
            });
        } catch (error) {
            console.error('Error in deletePiano:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa đàn piano',
                error: error.message
            });
        }
    }

    // GET /api/pianos/stats - Get statistics
    static async getStats(req, res) {
        try {
            const stats = await PianoModel.getStats();

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error in getStats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê',
                error: error.message
            });
        }
    }
}

module.exports = PianoController;
