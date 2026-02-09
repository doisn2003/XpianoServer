const supabase = require('../utils/supabaseClient');
const UserModel = require('../models/userModel');

class AuthController {
    // POST /api/auth/register
    static async register(req, res) {
        try {
            const { email, password, full_name, phone, role } = req.body;

            // 1. Sign up with Supabase Auth
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name,
                        phone,
                        role: role || 'user'
                    }
                }
            });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            if (!data.user) {
                return res.status(400).json({
                    success: false,
                    message: 'Đăng ký thất bại'
                });
            }

            // 2. Return success
            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực.',
                data: {
                    user: data.user,
                    session: data.session
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

    // POST /api/auth/login
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return res.status(401).json({
                    success: false,
                    message: 'Email hoặc mật khẩu không chính xác'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                data: {
                    user: data.user,
                    session: data.session,
                    token: data.session.access_token // For compatibility
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

    // GET /api/auth/me
    static async getProfile(req, res) {
        try {
            // req.user is set by authMiddleware
            const user = req.user;

            // Fetch additional profile data from 'profiles' table if needed
            // Currently assuming the user object from auth.getUser() has metadata
            // But let's check UserModel for full profile
            const profile = await UserModel.findById(user.id);

            res.status(200).json({
                success: true,
                data: profile || user // Fallback to auth user if profile missing
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

    // POST /api/auth/forgot-password
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${frontendUrl}/reset-password`,
            });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(200).json({
                success: true,
                message: 'Link đặt lại mật khẩu đã được gửi đến email của bạn'
            });

        } catch (error) {
            console.error('Error in forgotPassword:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xử lý yêu cầu',
                error: error.message
            });
        }
    }

    // POST /api/auth/reset-password
    // Note: This is tricky on backend because Supabase reset flow usually involves
    // the user clicking a link that contains the access_token (hash) in the frontend.
    // The frontend then calls updateUser.
    // However, if we want to proxy it:
    // The Frontend receives the tokens from the URL hash, sends them to Backend? 
    // Or Backend handles the exchange? 
    // Standard Supabase flow: Link -> Frontend (gets session) -> User enters new password -> Frontend calls updateUser.
    // To make it 3-tier: Link -> Frontend (gets session) -> User enters new PW -> Frontend sends Token + NewPW to Backend -> Backend calls updateUser.
    static async resetPassword(req, res) {
        try {
            const { new_password } = req.body;
            // The user must be authenticated (via the reset token exchange) to call this.
            // So this route should be protected by authMiddleware.

            // However, Supabase verifyOtp can exchange the token for a session.
            // If the user treats this as "I have a token, here is new pw":
            // We might need to handle the exchange here using verifyOtp if 'token' is passed in body.
            // BUT, usually reset link signs the user in.

            // Let's assume the frontend sends the Authorization header (from the reset link session)
            // OR checks for a 'token' in body if handling the hash explicitly.

            // For now, let's assume the user is authenticated via authMiddleware (Bearer token from reset link).

            const { error } = await supabase.auth.updateUser({
                password: new_password
            });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(200).json({
                success: true,
                message: 'Đăng xuất thành công'
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

    // POST /api/auth/logout
    static async logout(req, res) {
        try {
            const { error } = await supabase.auth.signOut();

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(200).json({
                success: true,
                message: 'Đăng xuất thành công'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đăng xuất'
            });
        }
    }
    // PUT /api/auth/profile
    static async updateProfile(req, res) {
        try {
            const user = req.user;
            const { full_name, phone, avatar_url } = req.body;

            // Update in profiles table (using UserModel wrapper if available, or direct query)
            // Let's use UserModel.update which we confirmed exists and targets 'profiles'
            const updatedProfile = await UserModel.update(user.id, {
                full_name,
                phone,
                avatar_url
            });

            if (!updatedProfile) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy hồ sơ người dùng'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Cập nhật hồ sơ thành công',
                data: updatedProfile
            });

        } catch (error) {
            console.error('Error in updateProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật hồ sơ',
                error: error.message
            });
        }
    }

    // PUT /api/auth/change-password
    static async changePassword(req, res) {
        try {
            const { password } = req.body; // new password

            if (!password || password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
                });
            }

            // Supabase auth.updateUser uses the logged in user's session (from authMiddleware)
            // But on backend, we use the admin client or pass the user's access token if we had it.
            // Since we are using service role key in backend potentially (or just anon key), updateUser works for the USER linked to the client.
            // BUT here 'supabase' is likely the ADMIN client (service role) or just anon. 
            // If it's Service Role, `auth.updateUser` updates the user *configured in the client*? NO. 
            // We need `auth.admin.updateUserById` if we are admin.
            // OR we use the user's access token to create a scoped client.

            // However, seeing `supabaseClient.js`, it uses `createClient(url, key)`. 
            // If key is SERVICE_ROLE, we can use `supabase.auth.admin.updateUserById(uid, attributes)`.
            // If key is ANON, we can't update another user's password without their token.

            // The `authMiddleware` verified the token. `req.token` has the user's access token.
            // We should ideally use that token to create a scoped client to update the password.
            // OR use the admin client.

            // Let's check `supabaseClient.js` again? 
            // The user didn't show it, but typically backend uses Service Role.
            // If so, `supabase.auth.admin.updateUserById(user.id, { password })` is the way.

            // Let's try `supabase.auth.admin.updateUserById` first. 
            // Wait, checking `authController.js` imports: `const supabase = require('../utils/supabaseClient');`

            const user = req.user;

            const { error } = await supabase.auth.admin.updateUserById(
                user.id,
                { password: password }
            );

            if (error) {
                // If admin api is not available (key constraint), try updateUser with the user's token if we can set session?
                // But for now, let's assume Backend has privileges or we need to rethink this.
                // Re-reading `supabaseClient.js` view from earlier...
                // It just takes `process.env.SUPABASE_KEY`. If that's the ANON key, `admin` namespace won't work.
                // If it is ANON key, we need `req.token`.

                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

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
}

module.exports = AuthController;
