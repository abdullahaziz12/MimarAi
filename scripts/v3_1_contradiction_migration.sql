-- MimarAi V3.1 Contradiction Scan Migration Script

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
