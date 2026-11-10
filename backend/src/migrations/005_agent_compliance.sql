CREATE TABLE IF NOT EXISTS agent_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, label TEXT NOT NULL DEFAULT 'Desktop Agent',
  revoked_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id, label)
);
CREATE TABLE IF NOT EXISTS do_not_call_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id, phone_number)
);
CREATE TABLE IF NOT EXISTS dialer_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id), action TEXT NOT NULL, record_id UUID, call_session_id UUID, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dnc_company_phone ON do_not_call_numbers(company_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_dialer_audit_company_date ON dialer_audit_events(company_id, created_at DESC);
