-- MimarAi V3.2 Density Check Migration Script
-- Adds density_flags JSONB column to the projects table

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS density_flags JSONB DEFAULT '{"clarifying_questions": "full", "personas": "ask", "nfrs": "ask"}'::jsonb;

COMMENT ON COLUMN projects.density_flags IS 'V3.2 Density Check flags: determining whether to skip or ask clarifying questions, personas, and NFRs.';
