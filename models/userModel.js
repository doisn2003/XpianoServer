const pool = require('../config/database');

class UserModel {
    // Find user by ID (from profiles table)
    static async findById(id) {
        try {
            const query = `
        SELECT *
        FROM profiles 
        WHERE id = $1
      `;
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Find all profiles (with optional filters)
    static async findAll(filters = {}) {
        try {
            let query = 'SELECT p.*, au.email FROM profiles p LEFT JOIN auth.users au ON p.id = au.id';
            const conditions = [];
            const params = [];
            let paramCount = 1;

            if (filters.role) {
                conditions.push(`p.role = $${paramCount}`);
                params.push(filters.role);
                paramCount++;
            }

            if (filters.is_verified !== undefined) {
                conditions.push(`au.email_confirmed_at IS ${filters.is_verified ? 'NOT NULL' : 'NULL'}`);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY p.created_at DESC';

            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    // Update user profile
    static async update(id, userData) {
        try {
            const fields = [];
            const params = [];
            let paramCount = 1;

            if (userData.full_name !== undefined) {
                fields.push(`full_name = $${paramCount}`);
                params.push(userData.full_name);
                paramCount++;
            }

            if (userData.phone !== undefined) {
                fields.push(`phone = $${paramCount}`);
                params.push(userData.phone);
                paramCount++;
            }

            if (userData.avatar_url !== undefined) {
                fields.push(`avatar_url = $${paramCount}`);
                params.push(userData.avatar_url);
                paramCount++;
            }

            // Role updates usually restricted
            if (userData.role !== undefined) {
                fields.push(`role = $${paramCount}`);
                params.push(userData.role);
                paramCount++;
            }

            if (userData.date_of_birth !== undefined) {
                fields.push(`date_of_birth = $${paramCount}`);
                params.push(userData.date_of_birth);
                paramCount++;
            }

            if (fields.length === 0) {
                throw new Error('No fields to update');
            }

            fields.push(`updated_at = CURRENT_TIMESTAMP`);
            params.push(id);

            const query = `
        UPDATE profiles 
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

    // Get stats
    static async getStats() {
        try {
            const query = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE role = 'user') as total_regular_users,
          COUNT(*) FILTER (WHERE role = 'teacher') as total_teachers,
          COUNT(*) FILTER (WHERE role = 'admin') as total_admins
        FROM profiles;
      `;
            const result = await pool.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }
}

module.exports = UserModel;
