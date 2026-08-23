-- MimarAi V2 Database Migration

-- 1. Extend the projects table with status, title, idea_text, step0_state, fixed_inputs
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'reviewing', 'accepted')),
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS idea_text TEXT,
ADD COLUMN IF NOT EXISTS step0_state JSONB,
ADD COLUMN IF NOT EXISTS fixed_inputs JSONB;

-- 2. Create rate_limits table for Phase 2 classification rate limiting (10 calls per hour)
CREATE TABLE IF NOT EXISTS rate_limits (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    count INT DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on rate_limits
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Allow users to read/update their own rate limit rows
CREATE POLICY "Users can manage their own rate limits" ON rate_limits
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
