-- ============================================================================
-- MimarAi V6.0 Final Plan Consolidation Database Migration
-- ============================================================================

-- 1. Create final_plans table
CREATE TABLE IF NOT EXISTS final_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'under_review', 'locked')),
    consolidated_summary JSONB DEFAULT '{}'::jsonb,
    mandatory_directives JSONB DEFAULT '[]'::jsonb,
    exception_handling JSONB DEFAULT '[]'::jsonb,
    security_considerations JSONB DEFAULT '[]'::jsonb,
    quality_flags JSONB DEFAULT '{}'::jsonb,
    draft_gemini JSONB DEFAULT '{}'::jsonb,
    draft_groq JSONB DEFAULT '{}'::jsonb,
    source_model TEXT DEFAULT 'gemini',
    locked_at TIMESTAMPTZ DEFAULT NULL,
    locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on project_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_final_plans_project_id ON final_plans(project_id);

-- 2. Enable RLS on final_plans
ALTER TABLE final_plans ENABLE ROW LEVEL SECURITY;

-- 3. Policy for project owners to manage their final plans
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'final_plans' AND policyname = 'Users can manage final plans for their owned projects'
    ) THEN
        CREATE POLICY "Users can manage final plans for their owned projects" ON final_plans
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM projects
                    WHERE projects.id = final_plans.project_id
                    AND projects.owner_id = auth.uid()
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM projects
                    WHERE projects.id = final_plans.project_id
                    AND projects.owner_id = auth.uid()
                )
            );
    END IF;
END $$;

COMMENT ON TABLE final_plans IS 'V6.0 Final Plan Consolidation: stores consolidated plan, exception handling, security considerations, and mandatory directives.';
