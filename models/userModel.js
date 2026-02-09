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

    // Find profile by email - Note: profiles table usually handles ID reference, 
    // but sometimes has email. Supabase auth.users has email. 
    // If profiles table doesn't have email, we might rely on the auth user object.
    // However, let's assume valid Supabase setup where triggers might sync email or we just use ID.
    // For specific business logic requiring User lookup by Email, we might need to search auth.users 
    // which requires Service Role, or if profiles has email.

    // For now, let's keep it simple. Auth is handled by Supabase. 
    // This Model is primarily for fetching User Profile data for the app.

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
