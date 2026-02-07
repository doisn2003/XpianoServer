const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class UserModel {
    // Create new user
    static async create(userData) {
        try {
            const { email, password, full_name, phone, role = 'user' } = userData;

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            const query = `
        INSERT INTO users (email, password, full_name, phone, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, full_name, phone, role, is_verified, created_at;
      `;

            const result = await pool.query(query, [
                email.toLowerCase(),
                hashedPassword,
                full_name,
                phone,
                role
            ]);

            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Find user by email
    static async findByEmail(email) {
        try {
            const query = 'SELECT * FROM users WHERE email = $1';
            const result = await pool.query(query, [email.toLowerCase()]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Find user by ID
    static async findById(id) {
        try {
            const query = `
        SELECT id, email, full_name, phone, role, is_verified, google_id, avatar_url, created_at, updated_at
        FROM users 
        WHERE id = $1
      `;
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Get all users (admin only)
    static async findAll(filters = {}) {
        try {
            let query = `
        SELECT id, email, full_name, phone, role, is_verified, created_at
        FROM users 
        WHERE 1=1
      `;
            const params = [];
            let paramCount = 1;

            if (filters.role) {
                query += ` AND role = $${paramCount}`;
                params.push(filters.role);
                paramCount++;
            }

            if (filters.is_verified !== undefined) {
                query += ` AND is_verified = $${paramCount}`;
                params.push(filters.is_verified);
                paramCount++;
            }

            query += ' ORDER BY created_at DESC';

            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    // Update user
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

            if (userData.role !== undefined) {
                fields.push(`role = $${paramCount}`);
                params.push(userData.role);
                paramCount++;
            }

            if (userData.is_verified !== undefined) {
                fields.push(`is_verified = $${paramCount}`);
                params.push(userData.is_verified);
                paramCount++;
            }

            if (fields.length === 0) {
                throw new Error('No fields to update');
            }

            fields.push(`updated_at = CURRENT_TIMESTAMP`);
            params.push(id);

            const query = `
        UPDATE users 
        SET ${fields.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING id, email, full_name, phone, role, is_verified, avatar_url, updated_at;
      `;

            const result = await pool.query(query, params);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Update password
    static async updatePassword(id, newPassword) {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            const query = `
        UPDATE users 
        SET password = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, email;
      `;
            const result = await pool.query(query, [hashedPassword, id]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Delete user
    static async delete(id) {
        try {
            const query = 'DELETE FROM users WHERE id = $1 RETURNING id, email';
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Verify password
    static async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    // Get user statistics
    static async getStats() {
        try {
            const query = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE role = 'user') as total_regular_users,
          COUNT(*) FILTER (WHERE role = 'teacher') as total_teachers,
          COUNT(*) FILTER (WHERE role = 'admin') as total_admins,
          COUNT(*) FILTER (WHERE is_verified = true) as verified_users
        FROM users;
      `;
            const result = await pool.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Create password reset token
    static async createPasswordResetToken(userId, token, expiresIn) {
        try {
            const expiresAt = new Date(Date.now() + expiresIn);
            const query = `
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id, token, expires_at;
      `;
            const result = await pool.query(query, [userId, token, expiresAt]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Find password reset token
    static async findPasswordResetToken(token) {
        try {
            const query = `
        SELECT prt.*, u.email, u.id as user_id
        FROM password_reset_tokens prt
        JOIN users u ON prt.user_id = u.id
        WHERE prt.token = $1 
          AND prt.used = false 
          AND prt.expires_at > NOW()
      `;
            const result = await pool.query(query, [token]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Mark token as used
    static async markTokenAsUsed(token) {
        try {
            const query = `
        UPDATE password_reset_tokens 
        SET used = true 
        WHERE token = $1
        RETURNING id;
      `;
            const result = await pool.query(query, [token]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Delete expired tokens (cleanup)
    static async deleteExpiredTokens() {
        try {
            const query = `
        DELETE FROM password_reset_tokens 
        WHERE expires_at < NOW() OR used = true
        RETURNING COUNT(*);
      `;
            const result = await pool.query(query);
            return result.rowCount;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = UserModel;
