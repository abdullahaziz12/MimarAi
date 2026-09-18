-- MimarAi V3.1 Contradiction Checks Schema Synchronization
-- Ensures contradiction_checks has all expected columns regardless of previous migration naming

-- 1. Ensure table exists
CREATE TABLE IF NOT EXISTS contradiction_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    round INT NOT NULL DEFAULT 1 CHECK (round IN (1, 2)),
    found BOOLEAN NOT NULL DEFAULT FALSE,
    explanation TEXT,
    conflicting_parts JSONB DEFAULT '[]'::jsonb,
    resolved_answer TEXT,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add any potentially missing columns to existing table
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS resolved_answer TEXT;
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS conflicting_parts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS found BOOLEAN DEFAULT FALSE;
ALTER TABLE contradiction_checks ADD COLUMN IF NOT EXISTS round INT DEFAULT 1;

-- 3. Synchronize timestamps if one column exists and not populated
UPDATE contradiction_checks 
SET created_at = checked_at 
WHERE created_at IS NULL AND checked_at IS NOT NULL;

UPDATE contradiction_checks 
SET checked_at = created_at 
WHERE checked_at IS NULL AND created_at IS NOT NULL;

-- 4. Ensure RLS is active
ALTER TABLE contradiction_checks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'contradiction_checks' 
        AND policyname = 'Users can manage contradiction checks for their owned projects'
    ) THEN
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
    END IF;
END $$;
