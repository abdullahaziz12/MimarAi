-- ============================================================================
-- V3.10 Admin Portal (Command Center) Database Migration
-- Tables: admin_allowlist, generation_events, user_sessions, ai_call_log
-- ============================================================================

-- 1. Admin Allowlist
CREATE TABLE IF NOT EXISTS admin_allowlist (
    email TEXT PRIMARY KEY,
    added_by TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Generation Events Log (Audit trail for success-rate accuracy)
CREATE TABLE IF NOT EXISTS generation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status TEXT NOT NULL, -- 'success' | 'failure'
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_events_created_at ON generation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_events_user_id ON generation_events(user_id);

-- 3. User Sessions (Active time & heartbeat tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen_at ON user_sessions(last_seen_at DESC);

-- 4. AI Call Log (Per-provider, per-stage call counts & latency instrumentation)
CREATE TABLE IF NOT EXISTS ai_call_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    project_id UUID,
    provider TEXT NOT NULL, -- 'groq' | 'gemini'
    stage TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_log_created_at ON ai_call_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_stage ON ai_call_log(stage);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_provider ON ai_call_log(provider);
