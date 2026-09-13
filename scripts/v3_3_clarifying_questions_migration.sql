-- MimarAi V3.3 Deepened Clarifying Questions Migration Script
-- Creates clarifying_questions table with RLS and indexes

CREATE TABLE IF NOT EXISTS clarifying_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    round INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on project_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_clarifying_questions_project_id 
ON clarifying_questions(project_id);

-- Enable Row Level Security (RLS)
ALTER TABLE clarifying_questions ENABLE ROW LEVEL SECURITY;

-- Owner-based project RLS policy
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

COMMENT ON TABLE clarifying_questions IS 'V3.3 Clarifying Questions: stores idea-specific clarifying questions and user answers.';
