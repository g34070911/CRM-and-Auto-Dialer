CREATE TABLE IF NOT EXISTS extension_queue_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'claimed',
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS call_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  event TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(call_session_id, event)
);
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_sessions_idempotency ON call_sessions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extension_queue_claims_next ON extension_queue_claims(profile_id, user_id, status, claimed_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_extension_queue_one_active_claim ON extension_queue_claims(profile_id, record_id, user_id) WHERE status='claimed';
