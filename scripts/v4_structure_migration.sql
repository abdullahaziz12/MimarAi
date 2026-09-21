-- ============================================================================
-- V4 Project Structure Generation Migration
-- ============================================================================

-- 1. Add structure_state JSONB column to projects table if not already present
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS structure_state JSONB DEFAULT '{}'::jsonb;

-- 2. Update status check constraint on projects to include 'features_accepted' and 'structure_accepted'
-- If a check constraint exists on status, drop and recreate it to permit all valid statuses.
DO $$
BEGIN
    -- Check if constraint exists and update
    IF EXISTS (
        SELECT 1 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'projects' AND column_name = 'status'
    ) THEN
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
    END IF;
END $$;
