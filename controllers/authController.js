const { supabase, getSupabaseClient, supabaseAdmin } = require('../utils/supabaseClient');
const UserModel = require('../models/userModel');
const sendEmail = require('../utils/emailService');
const pool = require('../config/database');

class AuthController {
    // POST /api/auth/send-otp
    static async sendOtp(req, res) {
        try {
            const { email, type = 'signup' } = req.body; // type: 'signup', 'recovery'

            if (!email) {
                return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email' });
            }
            console.log('Request to send OTP to:', email);

            // 1. Check if email exists (for recovery) or not exists (for signup)
            if (type === 'recovery') {
                // We might need to check if user exists in Supabase. 
                // However, security-wise, maybe we shouldn't reveal.
                // But for UX, let's proceed. 
            }

            // 2. Generate OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // 3. Save to DB (Upsert)
            const query = `
                INSERT INTO verification_codes (email, code, type, expires_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email, type) 
                DO UPDATE SET code = $2, expires_at = $4, created_at = NOW();
            `;
            await pool.query(query, [email, otpCode, type, expiresAt]);

            // 4. Send Email via Custom Service
            const subject = type === 'signup' ? 'Mã xác thực đăng ký Xpiano' : 'Mã xác thực đổi mật khẩu Xpiano';
            const html = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #F0C058;">${subject}</h2>
                    <p>Mã xác thực của bạn là:</p>
                    <h1 style="font-size: 32px; letter-spacing: 5px;">${otpCode}</h1>
                    <p>Mã này có hiệu lực trong 5 phút.</p>
                    <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
                </div>
            `;

            const emailResult = await sendEmail(email, subject, html);
            if (!emailResult.success) {
                throw new Error('Gửi email thất bại: ' + emailResult.error);
            }

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

            // 1. Verify OTP from DB
            const verifyQuery = `
                SELECT * FROM verification_codes 
                WHERE email = $1 AND code = $2 AND type = 'signup' AND expires_at > NOW()
            `;
            const verifyResult = await pool.query(verifyQuery, [email, token]);

            if (verifyResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã xác thực không đúng hoặc đã hết hạn'
                });
            }

            // 2. Create User in Supabase (Confirm immediately)
            const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm
                user_metadata: {
                    full_name,
                    phone,
                    role: role || 'user',
                    date_of_birth
                }
            });

            if (createError) throw createError;
            const user = userData.user;

            // 3. Ensure sync to 'public.users' AND 'profiles'
            // We need to know which table is the primary source of truth for the mobile app.
            // Assuming 'profiles' is the table linked to auth.users by trigger.
            // But User mentioned 'public.users'. Let's ensure both are handled or verified.

            // Explicitly Insert into 'profiles' (if trigger didn't catch it or for safety)
            // Use Upsert to allow triggers to have created it already
            await supabaseAdmin.from('profiles').upsert({
                id: user.id,
                full_name,
                phone,
                role: role || 'user',
                date_of_birth,
                email: email, // If profiles has email column
                avatar_url: null
            });

            // Also Insert/Upsert into 'public.users' if it exists and is different
            // Based on User request: "stored in public.users instead of auth.users" implies public.users is the main one.
            try {
                await pool.query(`
                    INSERT INTO users (id, email, full_name, phone, role, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                    ON CONFLICT (id) DO UPDATE 
                    SET full_name = $3, phone = $4, role = $5, updated_at = NOW();
                 `, [user.id, email, full_name, phone, role || 'user']);
            } catch (dbError) {
                // Maybe table doesn't exist or has different schema. Log but don't fail registration if Supabase User is created.
                console.warn('Sync to public.users warning:', dbError.message);
            }

            // 4. Delete used OTP
            await pool.query('DELETE FROM verification_codes WHERE email = $1 AND type = $2', [email, 'signup']);

            // 5. Auto Login to return session
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (loginError) throw loginError;

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                data: {
                    user: loginData.user,
                    session: loginData.session,
                    token: loginData.session.access_token
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
            const verifyQuery = `
                SELECT * FROM verification_codes 
                WHERE email = $1 AND code = $2 AND type = 'recovery' AND expires_at > NOW()
            `;
            const verifyResult = await pool.query(verifyQuery, [email, token]);

            if (verifyResult.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn' });
            }

            // 2. Find User ID by Email (using Admin client to list users)
            // supabase-js doesn't have effortless 'getUserByEmail', so we might need listUsers
            // or perform a trick. 
            // Better: update user by email directly? No, updateUserById needs ID.

            // Getting user ID:
            // Since we have supabaseAdmin, we can query auth.users directly via SQL wrapper if possible,
            // OR use listUsers with filter? listUsers doesn't filter perfectly.
            // Let's use our 'profiles' table to find the UUID, assuming profiles is synced.
            // If profiles doesn't have email, we are stuck. 
            // Wait, supabaseAdmin.auth.admin.listUsers() is pagination based.

            // Alternative: Use direct SQL to `auth.users` via our postgres pool? 
            // We connected to 'xpiano' database. auth schema is usually accessible if we have permissions.
            // But we are connect as 'postgres' or similar?

            // Let's rely on UserModel having access maybe? 
            // Or just fetch all users from Supabase Admin (might be slow if many users).

            // BEST WAY: Use `supabaseAdmin` to find user?
            // Actually, we can assume the email exists in profiles?
            // Let's try to query profiles (note: profiles might not store email if it's dependent on auth.users).

            // Let's try the safest Supabase Admin way:
            // There isn't a direct "getUserByEmail". 
            // However, we can use `supabaseAdmin.rpc` if we had a function.
            // OR, we can try `supabaseAdmin.from('profiles').select('id').eq('email', email).single()` 
            // IF we stored email in profiles. (Our UserModel doesn't show email column explicitly in updates, 
            // but let's check view_file of userModel again? No, I viewed it, it handles updates.)

            // Use pool to query auth.users directly?
            // pool is connected to database. `SELECT id FROM auth.users WHERE email = $1`
            let userId;
            const userRes = await pool.query('SELECT id FROM auth.users WHERE email = $1', [email]);
            if (userRes.rows.length > 0) {
                userId = userRes.rows[0].id;
            } else {
                return res.status(404).json({ success: false, message: 'Email chưa được đăng ký' });
            }

            // 3. Update Password
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
                userId,
                { password: new_password }
            );

            if (updateError) throw updateError;

            // 4. Delete used OTP
            await pool.query('DELETE FROM verification_codes WHERE email = $1 AND type = $2', [email, 'recovery']);

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

            // Fetch profile to get role and other info
            let profile = await UserModel.findById(data.user.id);

            // If profile is missing (e.g. wiped DB), restore it from Auth Metadata
            if (!profile) {
                console.log('⚠️ Profile missing for user. Restoring from Auth Metadata...');
                const metadata = data.user.user_metadata || {};

                // Construct profile data
                const newProfile = {
                    id: data.user.id,
                    email: data.user.email,
                    full_name: metadata.full_name || '',
                    phone: metadata.phone || '',
                    role: metadata.role || 'user',
                    avatar_url: metadata.avatar_url || ''
                };

                // Insert into public.profiles via SQL
                try {
                    await pool.query(
                        `INSERT INTO profiles (id, full_name, phone, role, avatar_url, email)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (id) DO NOTHING`,
                        [newProfile.id, newProfile.full_name, newProfile.phone, newProfile.role, newProfile.avatar_url, newProfile.email]
                    );
                    profile = newProfile; // Use the restored profile
                    console.log('✅ Profile restored successfully.');
                } catch (restorError) {
                    console.error('❌ Failed to restore profile:', restorError);
                    // Fallback to basic object if write fails
                    profile = newProfile;
                }
            }

            // Merge profile data with auth user
            const userWithProfile = {
                id: data.user.id,
                email: data.user.email,
                ...profile,
                role: profile.role, // Explicitly use role from profile
                is_verified: !!data.user.email_confirmed_at,
                user_metadata: data.user.user_metadata
            };

            console.log(`🔐 Login successful - User: ${data.user.email} - Role: ${userWithProfile.role}`);

            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                data: {
                    user: userWithProfile,
                    session: data.session,
                    token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    expires_at: data.session.expires_at
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

            console.log('🔍 DEBUG getProfile:');
            console.log('- User ID:', user.id);
            console.log('- Profile from DB:', profile);
            console.log('- Profile role:', profile?.role);

            // Merge auth metadata if profile is partial?
            // IMPORTANT: profile data should override user data
            const finalData = {
                id: user.id,
                email: user.email,
                ...profile, // This will include role from profiles table
                is_verified: !!user.email_confirmed_at,
                user_metadata: user.user_metadata
            };

            console.log('- Final data role:', finalData.role);

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

            console.log('🔄 Updating profile for user:', user.id);
            console.log('📝 Data to update:', { full_name, phone, avatar_url, date_of_birth });

            // Update in Supabase Auth Metadata using Admin client
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                user.id,
                {
                    user_metadata: {
                        full_name,
                        phone,
                        date_of_birth
                    }
                }
            );
            if (authError) {
                console.error('❌ Auth metadata update error:', authError);
                throw authError;
            }

            // Then sync to profiles table (including avatar_url)
            const updatedProfile = await UserModel.update(user.id, {
                full_name,
                phone,
                avatar_url,
                date_of_birth
            });

            console.log('✅ Profile updated successfully:', updatedProfile);

            res.status(200).json({
                success: true,
                message: 'Cập nhật hồ sơ thành công',
                data: updatedProfile
            });

        } catch (error) {
            console.error('❌ Error in updateProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật hồ sơ',
                error: error.message
            });
        }
    }

    // POST /api/auth/admin-login
    static async adminLogin(req, res) {
        try {
            const { email, password, role } = req.body;

            if (!role || !['admin', 'warehouse_owner'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Role không hợp lệ. Chỉ chấp nhận admin hoặc warehouse_owner.'
                });
            }

            // 1. Sign in with Supabase
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                return res.status(401).json({
                    success: false,
                    message: 'Email hoặc mật khẩu không chính xác'
                });
            }

            // 2. Check that the user actually has the requested role
            const profileRes = await pool.query(
                'SELECT role FROM profiles WHERE id = $1',
                [data.user.id]
            );
            const userRole = profileRes.rows.length > 0
                ? profileRes.rows[0].role
                : data.user.user_metadata?.role;

            if (userRole !== role) {
                return res.status(403).json({
                    success: false,
                    message: `Tài khoản này không có quyền ${role === 'admin' ? 'Admin' : 'Chủ kho đàn'}.`
                });
            }

            res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                data: {
                    user: { ...data.user, role: userRole },
                    session: data.session,
                    token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    expires_at: data.session.expires_at
                }
            });

        } catch (error) {
            console.error('Error in adminLogin:', error);
            res.status(500).json({ success: false, message: 'Lỗi khi đăng nhập', error: error.message });
        }
    }

    // POST /api/auth/admin-register (OTP-verified)
    static async adminRegister(req, res) {
        try {
            const { email, token, password, full_name, phone, role } = req.body;

            if (!role || !['admin', 'warehouse_owner'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Role không hợp lệ. Chỉ chấp nhận admin hoặc warehouse_owner.'
                });
            }

            // 1. Verify OTP from local DB
            const verifyQuery = `
                SELECT * FROM verification_codes 
                WHERE email = $1 AND code = $2 AND type = 'signup' AND expires_at > NOW()
            `;
            const verifyResult = await pool.query(verifyQuery, [email, token]);

            if (verifyResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã xác thực không đúng hoặc đã hết hạn'
                });
            }

            // 2. Create User in Supabase
            const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    full_name,
                    phone,
                    role
                }
            });

            if (createError) throw createError;
            const user = userData.user;

            // 3. Sync to profiles
            await supabaseAdmin.from('profiles').upsert({
                id: user.id,
                full_name,
                phone,
                role,
                email,
                avatar_url: null
            });

            // 4. Sync to public.users
            try {
                await pool.query(`
                    INSERT INTO users (id, email, full_name, phone, role, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                    ON CONFLICT (id) DO UPDATE 
                    SET full_name = $3, phone = $4, role = $5, updated_at = NOW();
                `, [user.id, email, full_name, phone, role]);
            } catch (dbError) {
                console.warn('Sync to public.users warning:', dbError.message);
            }

            // 5. Delete used OTP
            await pool.query('DELETE FROM verification_codes WHERE email = $1 AND type = $2', [email, 'signup']);

            // 6. Auto Login
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (loginError) throw loginError;

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                data: {
                    user: { ...loginData.user, role },
                    session: loginData.session,
                    token: loginData.session.access_token
                }
            });

        } catch (error) {
            console.error('Error in adminRegister:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đăng ký tài khoản quản trị',
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

    // POST /api/auth/refresh - Refresh access token
    static async refreshToken(req, res) {
        try {
            const { refresh_token } = req.body;

            if (!refresh_token) {
                return res.status(400).json({
                    success: false,
                    message: 'Refresh token is required'
                });
            }

            const { data, error } = await supabase.auth.refreshSession({
                refresh_token
            });

            if (error) {
                console.error('Token refresh error:', error);
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token không hợp lệ hoặc đã hết hạn'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    expires_at: data.session.expires_at
                }
            });
        } catch (error) {
            console.error('Error refreshing token:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi làm mới token',
                error: error.message
            });
        }
    }
}

module.exports = AuthController;
