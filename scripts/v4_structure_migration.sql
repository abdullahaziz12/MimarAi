-- ============================================================================
-- MimarAi V4 Project Structure Generation Database Migration
-- ============================================================================

-- OPTION A: Comprehensive Migration (With Explicit RLS & Policy Verification)
-- ----------------------------------------------------------------------------

-- 1. Add structure_state JSONB column to projects
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS structure_state JSONB DEFAULT '{}'::jsonb;

-- 2. Update projects status check constraint to include V4 status transitions
DO $$
BEGIN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
    ALTER TABLE projects ADD CONSTRAINT projects_status_check 
        CHECK (status IN (
            'draft', 
            'generating', 
            'locked_generating', 
            'reviewing', 
            'accepted', 
            'features_accepted', 
            'structure_accepted'
        ));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 3. Verify / Ensure RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'projects' AND policyname = 'Users can manage their own projects'
    ) THEN
        CREATE POLICY "Users can manage their own projects" ON projects
            FOR ALL
            USING (auth.uid() = owner_id)
            WITH CHECK (auth.uid() = owner_id);
    END IF;
END $$;

-- 4. Verify / Ensure RLS on comments table (reused for stage='structure')
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'comments' AND policyname = 'Users can manage comments for their owned projects'
    ) THEN
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
    END IF;
END $$;
