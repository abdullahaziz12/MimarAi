-- Migration V3.8: Lightweight Confirm Draft
-- Adds lightweight_draft jsonb column to projects table to store draft attempts, final status, and flagged indicator.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS lightweight_draft jsonb DEFAULT NULL;
