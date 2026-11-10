CREATE TABLE IF NOT EXISTS dialer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE, name TEXT NOT NULL, config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id), phone_field_key TEXT NOT NULL, phone_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'dialing',
  outcome TEXT, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ, duration_seconds INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS call_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE, user_id UUID REFERENCES users(id), outcome TEXT NOT NULL,
  notes TEXT, started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ NOT NULL, duration_seconds INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(call_session_id)
);
CREATE INDEX IF NOT EXISTS idx_call_sessions_record ON call_sessions(record_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_activities_record ON call_activities(record_id, created_at DESC);
