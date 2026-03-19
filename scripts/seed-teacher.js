
const { supabaseAdmin } = require('../utils/supabaseClient');
const pool = require('../config/database');

async function seedTeacher() {
    const email = 'tc@gmail.com';
    const password = '123456';
    const fullName = 'Mới toanh';
    const role = 'teacher';
    console.log(`🚀 Seeding teacher account: ${email}`);

    try {
        // 1. Check if user already exists in auth.users
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.users.find(u => u.email === email);

        let userId;

        if (existingUser) {
            console.log(`⚠️ User already exists with ID: ${existingUser.id}. Updating...`);
            userId = existingUser.id;
            
            // Update password and metadata
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
                userId,
                { 
                    password: password,
                    user_metadata: { full_name: fullName, role: role },
                    email_confirm: true
                }
            );
            if (updateError) throw updateError;
            console.log('✅ Updated existing user.');
        } else {
            // 2. Create user in auth.users
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName,
                    role: role
                }
            });

            if (createError) throw createError;
            userId = newUser.user.id;
            console.log(`✅ Created new user with ID: ${userId}`);
        }

        // 3. Ensure profile exists (Trigger should handle this, but let's be sure or check)
        // Wait, the trigger might take a moment or might have failed if it already existed.
        // Let's manually upsert to profiles to be safe.
        const profileData = {
            id: userId,
            full_name: fullName,
            role: role,
            email: email,
            updated_at: new Date()
        };

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert(profileData);

        if (profileError) {
            console.warn('⚠️ Profile upsert warning (might be handled by trigger):', profileError.message);
        } else {
            console.log('✅ Profile synced.');
        }

        // 4. Create record in teacher_profiles if missing
        const { data: teacherProfile, error: tpFetchError } = await supabaseAdmin
            .from('teacher_profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (!teacherProfile) {
            console.log('📝 Creating teacher_profile record...');
            const { error: tpError } = await supabaseAdmin
                .from('teacher_profiles')
                .insert({
                    user_id: userId,
                    full_name: fullName,
                    bio: 'Giáo viên chưa duyệt',
                    specializations: 'Piano Classical, Modern',
                    years_experience: 5
                });
            if (tpError) {
                console.warn('⚠️ Could not create teacher_profile:', tpError.message);
            } else {
                console.log('✅ teacher_profile created.');
            } 
        }

        console.log('\n✨ Seeding completed successfully!');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Password: ${password}`);
        console.log(`👤 Role: ${role}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedTeacher();
