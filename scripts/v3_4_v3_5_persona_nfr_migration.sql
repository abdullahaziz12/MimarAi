-- MimarAi V3.4 & V3.5 Persona & NFR Capture Migration Script
-- Adds personas and nfrs JSONB columns to the projects table

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS personas JSONB DEFAULT NULL;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS nfrs JSONB DEFAULT NULL;

COMMENT ON COLUMN projects.personas IS 'V3.4 Persona capture data containing answer and captured_at timestamp.';
COMMENT ON COLUMN projects.nfrs IS 'V3.5 Non-functional requirements data containing scale, data_sensitivity, availability, and captured_at timestamp.';
