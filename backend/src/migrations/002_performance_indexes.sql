-- Performance indexes for faster queries
-- Add GIN trigram index on data text for full-text search performance
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_source ON records(profile_id, source);
CREATE INDEX IF NOT EXISTS idx_records_batch ON records(profile_id, import_batch_id);
CREATE INDEX IF NOT EXISTS idx_fields_profile_order ON fields(profile_id, order_index ASC);
