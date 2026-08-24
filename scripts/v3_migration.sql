-- MimarAi V3 Database Migration Script

-- 1. Create comments table for Plan Review and future stages
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

-- 2. Add generation_state JSONB column to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS generation_state JSONB DEFAULT '{}'::jsonb;

-- Update projects status constraint to support V3 states if constrained
DO $$
BEGIN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
    ALTER TABLE projects ADD CONSTRAINT projects_status_check 
        CHECK (status IN ('draft', 'generating', 'locked_generating', 'reviewing', 'accepted'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 3. Create plan_history table for audit logging
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

-- 4. Create generation_rate_limits table
CREATE TABLE IF NOT EXISTS generation_rate_limits (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
