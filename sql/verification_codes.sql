CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL, -- 'signup', 'recovery', 'login'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, type)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_email_type ON verification_codes(email, type);
