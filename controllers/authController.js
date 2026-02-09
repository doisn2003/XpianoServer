const { supabase, getSupabaseClient } = require('../utils/supabaseClient');
const UserModel = require('../models/userModel');

class AuthController {
    // POST /api/auth/send-otp
    static async sendOtp(req, res) {
        try {
            const { email, type = 'signup' } = req.body; // type: 'signup', 'recovery', 'magiclink'

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp email'
                });
            }

            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: type === 'signup', // Only create if signup
                    data: type === 'signup' ? { role: 'user' } : undefined // Default metadata
                }
            });

            if (error) throw error;

            res.status(200).json({
                success: true,
                message: `Mã xác thực đã được gửi đến ${email}`
            });

        } catch (error) {
            console.error('Error in sendOtp:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi gửi mã OTP',
                error: error.message
            });
        }
    }

    // POST /api/auth/register-verify (Complete registration with OTP)
    static async registerWithOtp(req, res) {
        try {
            const { email, token, password, full_name, phone, role, date_of_birth } = req.body;

            // 1. Verify OTP to get session
            const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'signup'
            });

            if (verifyError) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã xác thực không đúng hoặc đã hết hạn'
                });
            }

            const user = sessionData.user;

            // 2. Update User Profile (Password & Metadata)
            const { data: updateData, error: updateError } = await supabase.auth.updateUser({
                password: password,
                data: {
                    full_name,
                    phone,
                    role: role || 'user',
                    date_of_birth
                }
            });

            if (updateError) throw updateError;

            // 3. Try Update 'profiles' table (optional, if trigger doesn't handle everything)
            // But we can just rely on metadata or update explicitly if needed.
            // Let's try to update profiles specifically if we have a model for it and want to be sure.
            try {
                await UserModel.update(user.id, {
                    full_name,
                    phone,
                    role: role || 'user',
                    date_of_birth
                });
            } catch (dbError) {
                console.warn('Profile sync warning:', dbError.message);
                // Don't fail the request if just profile sync fails, as Auth is main source
            }

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                data: {
                    user: updateData.user,
                    session: sessionData.session
                }
            });

        } catch (error) {
            console.error('Error in registerWithOtp:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xác thực đăng ký',
                error: error.message
            });
        }
    }

    // POST /api/auth/recover-verify (Reset password with OTP)
    static async recoverWithOtp(req, res) {
        try {
            const { email, token, new_password } = req.body;

            // 1. Verify OTP
            const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'recovery'
            });

            if (verifyError) return res.status(400).json({ success: false, message: 'Mã OTP không hợp lệ' });

            // 2. Update Password
            const { error: updateError } = await supabase.auth.updateUser({
                password: new_password
            });

            if (updateError) throw updateError;

            res.status(200).json({
                success: true,
                message: 'Đặt lại mật khẩu thành công'
            });

        } catch (error) {
            console.error('Error in recoverWithOtp:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đặt lại mật khẩu',
                error: error.message
            });
        }
    }

    // POST /api/auth/register (Original - kept for compatibility if needed, but we encourage OTP flow)
    static async register(req, res) {
        // ... (Deprecated or redirect to OTP flow?) 
        // For now, let's keep it but maybe we don't need it if Frontend switches fully.
        // Let's leave the original code for now or comment it out? 
        // User asked to "Upgrade", effectively replacing. 
        // I'll leave the original method but update the endpoints in routes.
        // Actually, let's just keep the file clean. I will keep this method but recommend using registerWithOtp.
        return res.status(400).json({
            success: false,
            message: 'Vui lòng sử dụng tính năng đăng ký với mã xác thực (OTP)'
        });
    }

    // POST /api/auth/login (Login with Password)
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
                    token: data.session.access_token
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

    // POST /api/auth/login-otp (Login with OTP - Passwordless)
    static async loginWithOtpVerify(req, res) {
        try {
            const { email, token } = req.body;
            // Verify Magic Link / OTP for login
            const { data, error } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'magiclink' // or 'email' depending on how sendOtp was called. Default sendOtp uses magiclink/otp.
            });

            if (error) {
                return res.status(401).json({ success: false, message: 'Mã OTP không hợp lệ' });
            }

            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                data: {
                    user: data.user,
                    session: data.session,
                    token: data.session.access_token
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /api/auth/me
    static async getProfile(req, res) {
        try {
            const user = req.user;
            // First check profiles table
            const profile = await UserModel.findById(user.id);

            // Merge auth metadata if profile is partial?
            const finalData = {
                ...user,
                ...profile,
                user_metadata: user.user_metadata // Ensure we have raw metadata
            };

            res.status(200).json({
                success: true,
                data: finalData
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

    // POST /api/auth/forgot-password (Send OTP for recovery)
    static async forgotPassword(req, res) {
        // Reuse sendOtp with type 'recovery'
        req.body.type = 'recovery';
        return AuthController.sendOtp(req, res);
    }

    // POST /api/auth/reset-password (Verify OTP and Set new PW)
    static async resetPassword(req, res) {
        return AuthController.recoverWithOtp(req, res);
    }

    // POST /api/auth/logout
    static async logout(req, res) {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            res.status(200).json({ success: true, message: 'Đăng xuất thành công' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Lỗi khi đăng xuất' });
        }
    }

    // PUT /api/auth/profile
    static async updateProfile(req, res) {
        try {
            const user = req.user;
            const { full_name, phone, avatar_url, date_of_birth } = req.body;

            // Update in Supabase Auth Metadata first
            const { error: authError } = await supabase.auth.updateUser({
                data: { full_name, phone, date_of_birth }
            });
            if (authError) throw authError;

            // Then sync to profiles
            const updatedProfile = await UserModel.update(user.id, {
                full_name,
                phone,
                avatar_url,
                date_of_birth
            });

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
            const { password } = req.body;
            if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu quá ngắn' });

            const supabaseClient = getSupabaseClient(req);
            const { error } = await supabaseClient.auth.updateUser({ password });

            if (error) throw error;

            res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = AuthController;
