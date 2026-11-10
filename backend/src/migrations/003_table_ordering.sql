-- Persist the user's manual row order within each profile.
ALTER TABLE records ADD COLUMN IF NOT EXISTS row_order INTEGER;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY created_at ASC, id) - 1 AS position
  FROM records
)
UPDATE records r
SET row_order = ranked.position
FROM ranked
WHERE r.id = ranked.id AND r.row_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_records_profile_row_order ON records(profile_id, row_order ASC, created_at ASC);
