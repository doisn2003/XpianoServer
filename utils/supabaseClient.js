const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or Key in environment variables');
}

console.log('Supabase Check - URL:', supabaseUrl);
// Enhanced logging to debug RLS
try {
    const payload = JSON.parse(atob(supabaseKey.split('.')[1]));
    console.log('Supabase Check - Anon Key Role:', payload.role);

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const servicePayload = JSON.parse(atob(process.env.SUPABASE_SERVICE_ROLE_KEY.split('.')[1]));
        console.log('Supabase Check - Service Key Role:', servicePayload.role);
    } else {
        console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Admin operations may fail if SUPABASE_KEY is not a service_role key.');
    }
} catch (e) {
    console.log('Supabase Check - Could not decode key');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
    }
});

// Admin client strictly for database operations that need to bypass RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
    }
});

const getSupabaseClient = (req) => {
    // If request has authorization header, create a client with that context
    if (req && req.headers && req.headers.authorization) {
        const token = req.headers.authorization.split(' ')[1];
        if (token) {
            return createClient(supabaseUrl, supabaseKey, {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            });
        }
    }
    // Fallback to anonymous/global client
    return supabase;
};

module.exports = { supabase, supabaseAdmin, getSupabaseClient };
