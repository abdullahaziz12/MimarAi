-- MimarAi V0 Database Schema
-- Supabase PostgreSQL Table Setup

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Note for V0: No RLS (Row-Level Security) or owner_id policies are added yet.
-- Those will be introduced in V1 alongside authentication.
