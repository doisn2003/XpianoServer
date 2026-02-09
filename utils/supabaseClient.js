const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or Key in environment variables');
}

console.log('Supabase Check - URL:', supabaseUrl);
// Enhanced logging to debug RLS
try {
    const payload = JSON.parse(atob(supabaseKey.split('.')[1]));
    console.log('Supabase Check - Key Role:', payload.role);
} catch (e) {
    console.log('Supabase Check - Could not decode key');
}
console.log('Supabase Check - Is Service Role:', supabaseKey && supabaseKey.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') ? 'Likely Yes' : 'Unknown');

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
    }
});

// Admin client strictly for database operations that need to bypass RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
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
