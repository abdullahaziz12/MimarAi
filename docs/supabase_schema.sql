-- MimarAi Supabase PostgreSQL Complete As-Built Database Schema
-- Precision Architecture & Planning Layer Reference Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    idea_text TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'locked_generating', 'reviewing', 'accepted', 'generation_failed')),
    step0_state JSONB DEFAULT '{}'::jsonb,
    fixed_inputs JSONB DEFAULT '{}'::jsonb,
    generation_state JSONB DEFAULT '{}'::jsonb,
    density_flags JSONB DEFAULT '{"clarifying_questions": "full", "personas": "ask", "nfrs": "ask"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their owned projects" ON projects
    FOR ALL
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 2. Step 0 Classification Rate Limits Table (10 calls/hour)
CREATE TABLE IF NOT EXISTS rate_limits (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    count INT DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on rate_limits
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own rate limits" ON rate_limits
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. Generation & Comment Batch Rate Limits Table
CREATE TABLE IF NOT EXISTS generation_rate_limits (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pipeline_count INT DEFAULT 0,
    pipeline_window_start TIMESTAMPTZ DEFAULT NOW(),
    batch_count INT DEFAULT 0,
    batch_window_start TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on generation_rate_limits
ALTER TABLE generation_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their generation rate limits" ON generation_rate_limits
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'features',
    target_feature_id TEXT,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage comments for their owned projects" ON comments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = comments.project_id
            AND projects.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = comments.project_id
            AND projects.owner_id = auth.uid()
        )
    );

-- 5. Plan History Table
CREATE TABLE IF NOT EXISTS plan_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    feature_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on plan_history
ALTER TABLE plan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history of their owned projects" ON plan_history
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = plan_history.project_id
            AND projects.owner_id = auth.uid()
        )
    );

-- 6. V3.1 Contradiction Checks Table
CREATE TABLE IF NOT EXISTS contradiction_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    round INT NOT NULL CHECK (round IN (1, 2)),
    found BOOLEAN NOT NULL,
    explanation TEXT,
    conflicting_parts JSONB DEFAULT '[]'::jsonb,
    resolved_answer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on contradiction_checks
ALTER TABLE contradiction_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage contradiction checks for their owned projects" ON contradiction_checks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = contradiction_checks.project_id
            AND projects.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = contradiction_checks.project_id
            AND projects.owner_id = auth.uid()
        )
    );

-- 7. V3.3 Clarifying Questions Table
CREATE TABLE IF NOT EXISTS clarifying_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    round INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on clarifying_questions
ALTER TABLE clarifying_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage clarifying questions for their owned projects" ON clarifying_questions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = clarifying_questions.project_id
            AND projects.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = clarifying_questions.project_id
            AND projects.owner_id = auth.uid()
        )
    );


