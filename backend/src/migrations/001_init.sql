-- ============================================================
-- CRM core schema
-- Multi-tenant: every business-owned row carries company_id
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- admin | manager | agent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

-- A "profile" is a business's own working unit: a campaign, a department,
-- a client book -- e.g. "Dispatch", "B2B Tech Outreach", "Medical Billing".
-- Each profile owns its own field layout and its own records; nothing leaks
-- across profiles, exactly like the user asked for.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dynamic field definitions. When a user imports a CSV/XLSX, we read the
-- header row and create one row here per column, preserving order via
-- order_index -- this is what lets each profile keep "the same fields as
-- in the Excel sheet".
CREATE TABLE IF NOT EXISTS fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,             -- machine key, derived from header, e.g. "phone_number"
  label TEXT NOT NULL,           -- original header text, e.g. "Phone Number"
  type TEXT NOT NULL DEFAULT 'text', -- text | number | date | email | phone | boolean | dropdown | url
  order_index INT NOT NULL DEFAULT 0,
  options JSONB,                 -- for dropdown type: ["New","Contacted",...]
  is_system BOOLEAN NOT NULL DEFAULT false, -- true for built-in fields like status/assigned_to/tags
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, key)
);

-- The records themselves. All the free-form/dynamic column data lives in
-- `data` (JSONB), keyed by field.key, so any spreadsheet shape can be
-- stored without a schema migration per customer. Standard CRM columns
-- (status, assigned_to, tags, source) are kept as real columns so they're
-- fast and easy to filter/index.
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'New',       -- New | Contacted | Qualified | Converted | Lost
  assigned_to UUID REFERENCES users(id),
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT,                              -- e.g. "import: leads_march.csv"
  import_batch_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_profile ON records(profile_id);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_records_assigned ON records(profile_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_records_data_gin ON records USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_records_tags_gin ON records USING GIN (tags);

-- Tracks each import so users can see history / filter "imported in batch X"
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved filter presets per profile/user
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
