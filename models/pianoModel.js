const pool = require('../config/database');

class PianoModel {
    // Get all pianos with optional filters
    static async findAll(filters = {}) {
        try {
            let query = 'SELECT * FROM pianos WHERE 1=1';
            const params = [];
            let paramCount = 1;

            // Filter by category
            if (filters.category) {
                query += ` AND category = $${paramCount}`;
                params.push(filters.category);
                paramCount++;
            }

            // Filter by minimum rating
            if (filters.minRating) {
                query += ` AND rating >= $${paramCount}`;
                params.push(filters.minRating);
                paramCount++;
            }

            // Filter by max price per hour
            if (filters.maxPrice) {
                query += ` AND price_per_hour <= $${paramCount}`;
                params.push(filters.maxPrice);
                paramCount++;
            }

            query += ' ORDER BY created_at DESC';

            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    // Get piano by ID
    static async findById(id) {
        try {
            const query = 'SELECT * FROM pianos WHERE id = $1';
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Create new piano
    static async create(pianoData) {
        try {
            const query = `
        INSERT INTO pianos (name, image_url, category, price_per_hour, rating, reviews_count, description, features)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;

            // Features should be an array
            const features = Array.isArray(pianoData.features)
                ? pianoData.features
                : [];

            const result = await pool.query(query, [
                pianoData.name,
                pianoData.image_url,
                pianoData.category,
                pianoData.price_per_hour,
                pianoData.rating || 0,
                pianoData.reviews_count || 0,
                pianoData.description,
                features
            ]);

            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Update piano
    static async update(id, pianoData) {
        try {
            const fields = [];
            const params = [];
            let paramCount = 1;

            if (pianoData.name !== undefined) {
                fields.push(`name = $${paramCount}`);
                params.push(pianoData.name);
                paramCount++;
            }

            if (pianoData.image_url !== undefined) {
                fields.push(`image_url = $${paramCount}`);
                params.push(pianoData.image_url);
                paramCount++;
            }

            if (pianoData.category !== undefined) {
                fields.push(`category = $${paramCount}`);
                params.push(pianoData.category);
                paramCount++;
            }

            if (pianoData.price_per_hour !== undefined) {
                fields.push(`price_per_hour = $${paramCount}`);
                params.push(pianoData.price_per_hour);
                paramCount++;
            }

            if (pianoData.rating !== undefined) {
                fields.push(`rating = $${paramCount}`);
                params.push(pianoData.rating);
                paramCount++;
            }

            if (pianoData.reviews_count !== undefined) {
                fields.push(`reviews_count = $${paramCount}`);
                params.push(pianoData.reviews_count);
                paramCount++;
            }

            if (pianoData.description !== undefined) {
                fields.push(`description = $${paramCount}`);
                params.push(pianoData.description);
                paramCount++;
            }

            if (pianoData.features !== undefined) {
                fields.push(`features = $${paramCount}`);
                const features = Array.isArray(pianoData.features)
                    ? pianoData.features
                    : [];
                params.push(features);
                paramCount++;
            }

            if (fields.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(id);
            const query = `
        UPDATE pianos 
        SET ${fields.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING *;
      `;

            const result = await pool.query(query, params);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Delete piano
    static async delete(id) {
        try {
            const query = 'DELETE FROM pianos WHERE id = $1 RETURNING *;';
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Get statistics
    static async getStats() {
        try {
            const query = `
        SELECT 
          COUNT(*) as total_pianos,
          AVG(rating) as avg_rating,
          AVG(price_per_hour) as avg_price,
          COUNT(DISTINCT category) as total_categories
        FROM pianos;
      `;
            const result = await pool.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }
}

module.exports = PianoModel;
