const UserModel = require('../models/userModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

class AuthController {
    // Generate JWT token
    static generateToken(userId, role) {
        return jwt.sign(
            { userId, role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );
    }

    // POST /api/auth/register - Register new user
    static async register(req, res) {
        try {
            const { email, password, full_name, phone, role } = req.body;

            // Validation
            if (!email || !password || !full_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Email, mật khẩu và họ tên là bắt buộc'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email không hợp lệ'
                });
            }

            // Validate password length
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu phải có ít nhất 6 ký tự'
                });
            }

            // Check if user already exists
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Email đã được sử dụng'
                });
            }

            // Validate role
            const validRoles = ['user', 'teacher'];
            const userRole = role && validRoles.includes(role) ? role : 'user';

            // Create user
            const user = await UserModel.create({
                email,
                password,
                full_name,
                phone,
                role: userRole
            });

            // Generate token
            const token = AuthController.generateToken(user.id, user.role);

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                data: {
                    user: {
                        id: user.id,
                        email: user.email,
                        full_name: user.full_name,
                        phone: user.phone,
                        role: user.role,
                        is_verified: user.is_verified
                    },
                    token
                }
            });
        } catch (error) {
            console.error('Error in register:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đăng ký tài khoản',
                error: error.message
            });
        }
    }

    // POST /api/auth/login - Login user
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            // Validation
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email và mật khẩu là bắt buộc'
                });
            }

            // Find user
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Email hoặc mật khẩu không đúng'
                });
            }

            // Verify password
            const isPasswordValid = await UserModel.verifyPassword(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Email hoặc mật khẩu không đúng'
                });
            }

            // Generate token
            const token = AuthController.generateToken(user.id, user.role);

            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                data: {
                    user: {
                        id: user.id,
                        email: user.email,
                        full_name: user.full_name,
                        phone: user.phone,
                        role: user.role,
                        is_verified: user.is_verified,
                        avatar_url: user.avatar_url
                    },
                    token
                }
            });
        } catch (error) {
            console.error('Error in login:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đăng nhập',
                error: error.message
            });
        }
    }

    // GET /api/auth/me - Get current user profile
    static async getProfile(req, res) {
        try {
            const user = await UserModel.findById(req.user.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    phone: user.phone,
                    role: user.role,
                    is_verified: user.is_verified,
                    avatar_url: user.avatar_url,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            console.error('Error in getProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin người dùng',
                error: error.message
            });
        }
    }

    // PUT /api/auth/profile - Update user profile
    static async updateProfile(req, res) {
        try {
            const { full_name, phone, avatar_url } = req.body;

            const updatedUser = await UserModel.update(req.user.id, {
                full_name,
                phone,
                avatar_url
            });

            if (!updatedUser) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Cập nhật thông tin thành công',
                data: updatedUser
            });
        } catch (error) {
            console.error('Error in updateProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật thông tin',
                error: error.message
            });
        }
    }

    // PUT /api/auth/change-password - Change password
    static async changePassword(req, res) {
        try {
            const { current_password, new_password } = req.body;

            if (!current_password || !new_password) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc'
                });
            }

            if (new_password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
                });
            }

            // Get user with password
            const user = await UserModel.findByEmail(req.user.email);

            // Verify current password
            const isPasswordValid = await UserModel.verifyPassword(current_password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Mật khẩu hiện tại không đúng'
                });
            }

            // Update password
            await UserModel.updatePassword(req.user.id, new_password);

            res.status(200).json({
                success: true,
                message: 'Đổi mật khẩu thành công'
            });
        } catch (error) {
            console.error('Error in changePassword:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đổi mật khẩu',
                error: error.message
            });
        }
    }

    // POST /api/auth/forgot-password - Request password reset
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email là bắt buộc'
                });
            }

            // Find user
            const user = await UserModel.findByEmail(email);
            if (!user) {
                // Don't reveal if email exists or not (security)
                return res.status(200).json({
                    success: true,
                    message: 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi'
                });
            }

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

            // Save token to database
            const expiresIn = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN) || 3600000; // 1 hour
            await UserModel.createPasswordResetToken(user.id, hashedToken, expiresIn);

            // Create reset URL
            const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

            // Send email (if configured)
            try {
                await AuthController.sendPasswordResetEmail(user.email, user.full_name, resetUrl);
                console.log(`Password reset email sent to ${user.email}`);
            } catch (emailError) {
                console.error('Error sending email:', emailError);
                // Continue even if email fails (for development)
            }

            // For development, also return the token
            const responseData = {
                success: true,
                message: 'Link đặt lại mật khẩu đã được gửi đến email của bạn'
            };

            if (process.env.NODE_ENV === 'development') {
                responseData.resetUrl = resetUrl; // Only in development
            }

            res.status(200).json(responseData);
        } catch (error) {
            console.error('Error in forgotPassword:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xử lý yêu cầu',
                error: error.message
            });
        }
    }

    // POST /api/auth/reset-password - Reset password with token
    static async resetPassword(req, res) {
        try {
            const { token, new_password } = req.body;

            if (!token || !new_password) {
                return res.status(400).json({
                    success: false,
                    message: 'Token và mật khẩu mới là bắt buộc'
                });
            }

            if (new_password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
                });
            }

            // Hash the token to compare with database
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            // Find valid token
            const resetToken = await UserModel.findPasswordResetToken(hashedToken);

            if (!resetToken) {
                return res.status(400).json({
                    success: false,
                    message: 'Token không hợp lệ hoặc đã hết hạn'
                });
            }

            // Update password
            await UserModel.updatePassword(resetToken.user_id, new_password);

            // Mark token as used
            await UserModel.markTokenAsUsed(hashedToken);

            res.status(200).json({
                success: true,
                message: 'Đặt lại mật khẩu thành công'
            });
        } catch (error) {
            console.error('Error in resetPassword:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đặt lại mật khẩu',
                error: error.message
            });
        }
    }

    // Helper: Send password reset email
    static async sendPasswordResetEmail(email, fullName, resetUrl) {
        // Check if email is configured
        if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
            console.log('⚠️  Email not configured. Reset URL:', resetUrl);
            return;
        }

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'Đặt lại mật khẩu - Xpiano',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Xin chào ${fullName},</h2>
          <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Xpiano của mình.</p>
          <p>Vui lòng nhấp vào nút bên dưới để đặt lại mật khẩu:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Đặt lại mật khẩu
            </a>
          </div>
          <p>Hoặc copy link sau vào trình duyệt:</p>
          <p style="background-color: #f5f5f5; padding: 10px; word-break: break-all;">${resetUrl}</p>
          <p><strong>Link này sẽ hết hạn sau 1 giờ.</strong></p>
          <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            Email này được gửi tự động, vui lòng không trả lời.<br>
            © 2026 Xpiano - Piano Rental Platform
          </p>
        </div>
      `
        };

        await transporter.sendMail(mailOptions);
    }

    // POST /api/auth/logout - Logout (client-side token removal)
    static async logout(req, res) {
        // Since JWT is stateless, logout is handled on client-side
        // This endpoint is just for consistency
        res.status(200).json({
            success: true,
            message: 'Đăng xuất thành công'
        });
    }
}

module.exports = AuthController;
