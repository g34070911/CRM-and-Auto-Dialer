import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership } from '../utils/helpers.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Builds a WHERE clause from the standard filters + dynamic field conditions
export function buildFilters(query_params, startIndex) {
  const clauses = [];
  const values = [];
  let i = startIndex;

  const { search, status, assigned_to, tags, date_from, date_to, source, filters } = query_params;

  if (search) {
    clauses.push(`(data::text ILIKE $${i} OR status ILIKE $${i} OR source ILIKE $${i} OR array_to_string(tags, ' ') ILIKE $${i})`);
    values.push(`%${search}%`);
    i++;
  }
  if (status) {
    const statuses = Array.isArray(status) ? status : String(status).split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      clauses.push(`status = ANY($${i}::text[])`);
      values.push(statuses);
      i++;
    }
  }
  if (assigned_to) {
    clauses.push(`assigned_to = $${i}`);
    values.push(assigned_to);
    i++;
  }
  if (tags) {
    const tagList = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      clauses.push(`tags && $${i}::text[]`);
      values.push(tagList);
      i++;
    }
  }
  if (source) {
    clauses.push(`source ILIKE $${i}`);
    values.push(`%${source}%`);
    i++;
  }
  if (date_from) {
    clauses.push(`created_at >= $${i}::timestamptz`);
    values.push(date_from);
    i++;
  }
  if (date_to) {
    clauses.push(`created_at <= $${i}::timestamptz`);
    values.push(date_to);
    i++;
  }

  // Dynamic per-field conditions
  if (filters) {
    let parsed = [];
    try {
      parsed = typeof filters === 'string' ? JSON.parse(filters) : filters;
    } catch {
      parsed = [];
    }
    if (Array.isArray(parsed)) {
      for (const cond of parsed) {
        const { key, op, value } = cond;
        if (!key || !op) continue;
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
        const path = `data->>'${sanitizedKey}'`;

        switch (op) {
          case 'eq':
            clauses.push(`LOWER(${path}) = LOWER($${i})`);
            values.push(String(value));
            i++;
            break;
          case 'neq':
            clauses.push(`(LOWER(${path}) != LOWER($${i}) OR ${path} IS NULL)`);
            values.push(String(value));
            i++;
            break;
          case 'contains':
            clauses.push(`${path} ILIKE $${i}`);
            values.push(`%${value}%`);
            i++;
            break;
          case 'not_contains':
            clauses.push(`(${path} NOT ILIKE $${i} OR ${path} IS NULL)`);
            values.push(`%${value}%`);
            i++;
            break;
          case 'starts_with':
            clauses.push(`${path} ILIKE $${i}`);
            values.push(`${value}%`);
            i++;
            break;
          case 'ends_with':
            clauses.push(`${path} ILIKE $${i}`);
            values.push(`%${value}`);
            i++;
            break;
          case 'gt':
            clauses.push(`NULLIF(regexp_replace(${path}, '[^0-9.-]', '', 'g'), '')::numeric > $${i}`);
            values.push(Number(String(value).replace(/[^0-9.-]/g, '')) || 0);
            i++;
            break;
          case 'gte':
            clauses.push(`NULLIF(regexp_replace(${path}, '[^0-9.-]', '', 'g'), '')::numeric >= $${i}`);
            values.push(Number(String(value).replace(/[^0-9.-]/g, '')) || 0);
            i++;
            break;
          case 'lt':
            clauses.push(`NULLIF(regexp_replace(${path}, '[^0-9.-]', '', 'g'), '')::numeric < $${i}`);
            values.push(Number(String(value).replace(/[^0-9.-]/g, '')) || 0);
            i++;
            break;
          case 'lte':
            clauses.push(`NULLIF(regexp_replace(${path}, '[^0-9.-]', '', 'g'), '')::numeric <= $${i}`);
            values.push(Number(String(value).replace(/[^0-9.-]/g, '')) || 0);
            i++;
            break;
          case 'date_gte':
            clauses.push(`(${path})::timestamptz >= $${i}::timestamptz`);
            values.push(value);
            i++;
            break;
          case 'date_lte':
            clauses.push(`(${path})::timestamptz <= $${i}::timestamptz`);
            values.push(value);
            i++;
            break;
          case 'date_eq':
            clauses.push(`(${path})::date = $${i}::date`);
            values.push(value);
            i++;
            break;
          case 'is_empty':
            clauses.push(`(${path} IS NULL OR ${path} = '')`);
            break;
          case 'is_not_empty':
            clauses.push(`(${path} IS NOT NULL AND ${path} != '')`);
            break;
          case 'in':
            clauses.push(`${path} = ANY($${i}::text[])`);
            values.push(Array.isArray(value) ? value : [value]);
            i++;
            break;
          default:
            break;
        }
      }
    }
  }

  return { clause: clauses.length ? 'AND ' + clauses.join(' AND ') : '', values, nextIndex: i };
}

// GET /stats - summary stats by status for pipeline / kanban / metrics
router.get('/stats', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);

    const { clause, values } = buildFilters(req.query, 2);
    const params = [req.params.profileId, ...values];

    const { rows: statusCounts } = await query(
      `SELECT status, COUNT(*)::int AS count
       FROM records
       WHERE profile_id = $1 ${clause}
       GROUP BY status`,
      params
    );

    const total = statusCounts.reduce((acc, row) => acc + row.count, 0);

    const breakdown = {
      New: 0,
      Contacted: 0,
      Qualified: 0,
      Converted: 0,
      Lost: 0,
    };
    for (const r of statusCounts) {
      breakdown[r.status] = r.count;
    }

    res.json({ total, breakdown, statusCounts });
  } catch (err) {
    next(err);
  }
});

// GET list with filters + pagination + sorting
router.get('/', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    // Sorting handling
    const rawSortBy = req.query.sortBy || 'row_order';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    let sortExpression = 'row_order';

    if (['row_order', 'created_at', 'updated_at', 'status', 'source'].includes(rawSortBy)) {
      sortExpression = rawSortBy;
    } else if (rawSortBy.startsWith('data.')) {
      const fieldKey = rawSortBy.slice(5).replace(/[^a-zA-Z0-9_-]/g, '');
      sortExpression = `data->>'${fieldKey}'`;
    } else {
      const fieldKey = rawSortBy.replace(/[^a-zA-Z0-9_-]/g, '');
      sortExpression = `data->>'${fieldKey}'`;
    }

    const { clause, values } = buildFilters(req.query, 2);
    const params = [req.params.profileId, ...values];

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM records WHERE profile_id = $1 ${clause}`,
      params
    );
    const total = countResult.rows[0].total;

    const dataResult = await query(
      `SELECT r.*, u.name AS assigned_user_name, u.email AS assigned_user_email
       FROM records r
       LEFT JOIN users u ON u.id = r.assigned_to
       WHERE r.profile_id = $1 ${clause}
        ORDER BY ${sortExpression} ${sortDir} NULLS LAST, created_at ASC, id ASC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    res.json({
      records: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /reorder - persist the visible/manual row order for this profile.
router.put('/reorder', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds array required' });
    }

    await client.query('BEGIN');
    const result = await client.query(
      `WITH requested AS (
         SELECT id, position FROM unnest($1::uuid[]) WITH ORDINALITY AS requested(id, position)
       ), available_positions AS (
         SELECT row_order, ROW_NUMBER() OVER (ORDER BY row_order, created_at, id) AS position
         FROM records
         WHERE profile_id = $2 AND id = ANY($1::uuid[])
       )
       UPDATE records
       SET row_order = available_positions.row_order, updated_at = now()
       FROM requested
       JOIN available_positions USING (position)
       WHERE records.id = requested.id AND records.profile_id = $2
       RETURNING records.id`,
      [orderedIds, req.params.profileId]
    );
    if (result.rowCount !== orderedIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'orderedIds must contain records from this profile only' });
    }
    await client.query('COMMIT');
    res.json({ updated: result.rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// GET single record detail
router.get('/:recordId', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows } = await query(
      `SELECT r.*, u.name AS assigned_user_name, u.email AS assigned_user_email, c.name AS creator_name
       FROM records r
       LEFT JOIN users u ON u.id = r.assigned_to
       LEFT JOIN users c ON c.id = r.created_by
       WHERE r.id = $1 AND r.profile_id = $2`,
      [req.params.recordId, req.params.profileId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST create record manually
router.post('/', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { data, status, assigned_to, tags, source } = req.body;
    const finalTags = Array.isArray(tags) ? tags : [];
    const { rows } = await query(
       `INSERT INTO records (profile_id, data, status, assigned_to, tags, source, created_by, row_order)
        VALUES ($1, $2, COALESCE($3, 'New'), $4, $5::text[], COALESCE($6, 'manual'), $7,
          (SELECT COALESCE(MAX(row_order), -1) + 1 FROM records WHERE profile_id = $1)) RETURNING *`,
      [
        req.params.profileId,
        JSON.stringify(data || {}),
        status,
        assigned_to || null,
        finalTags,
        source,
        req.user.user_id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST clone record
router.post('/:recordId/clone', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows: sourceRows } = await query(
      'SELECT * FROM records WHERE id = $1 AND profile_id = $2',
      [req.params.recordId, req.params.profileId]
    );
    if (sourceRows.length === 0) return res.status(404).json({ error: 'Source record not found' });
    const src = sourceRows[0];

    const { rows } = await query(
       `INSERT INTO records (profile_id, data, status, assigned_to, tags, source, created_by, row_order)
        VALUES ($1, $2, $3, $4, $5::text[], $6, $7,
          (SELECT COALESCE(MAX(row_order), -1) + 1 FROM records WHERE profile_id = $1)) RETURNING *`,
      [
        req.params.profileId,
        JSON.stringify(src.data || {}),
        'New',
        src.assigned_to,
        src.tags || [],
        `clone: ${src.id.slice(0, 8)}`,
        req.user.user_id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH inline edit / update record
router.patch('/:recordId', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { data, status, assigned_to, tags, source } = req.body;

    const { rows: existingRows } = await query(
      'SELECT * FROM records WHERE id = $1 AND profile_id = $2',
      [req.params.recordId, req.params.profileId]
    );
    if (existingRows.length === 0) return res.status(404).json({ error: 'Record not found' });
    const existing = existingRows[0];

    const mergedData = data ? { ...existing.data, ...data } : existing.data;
    const finalTags = tags !== undefined ? (Array.isArray(tags) ? tags : []) : (existing.tags || []);

    const { rows } = await query(
      `UPDATE records SET
         data = $1,
         status = COALESCE($2, status),
         assigned_to = CASE WHEN $3::text IS NOT NULL THEN $3::uuid ELSE assigned_to END,
         tags = $4::text[],
         source = COALESCE($5, source),
         updated_at = now()
       WHERE id = $6 AND profile_id = $7 RETURNING *`,
      [
        JSON.stringify(mergedData),
        status || null,
        assigned_to !== undefined ? (assigned_to || null) : null,
        finalTags,
        source || null,
        req.params.recordId,
        req.params.profileId,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE single record
router.delete('/:recordId', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows } = await query(
      'DELETE FROM records WHERE id = $1 AND profile_id = $2 RETURNING id',
      [req.params.recordId, req.params.profileId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST bulk actions (bulk delete, bulk status, bulk assign, bulk tag)
router.post('/bulk', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { ids, action, value } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

    if (action === 'delete') {
      await query('DELETE FROM records WHERE id = ANY($1::uuid[]) AND profile_id = $2', [ids, req.params.profileId]);
      return res.json({ deleted: ids.length });
    }
    if (action === 'set_status') {
      await query(
        'UPDATE records SET status = $1, updated_at = now() WHERE id = ANY($2::uuid[]) AND profile_id = $3',
        [value, ids, req.params.profileId]
      );
      return res.json({ updated: ids.length });
    }
    if (action === 'set_assigned_to') {
      await query(
        'UPDATE records SET assigned_to = $1, updated_at = now() WHERE id = ANY($2::uuid[]) AND profile_id = $3',
        [value || null, ids, req.params.profileId]
      );
      return res.json({ updated: ids.length });
    }
    if (action === 'add_tag') {
      await query(
        `UPDATE records SET tags = array_append(array_remove(tags, $1), $1), updated_at = now()
         WHERE id = ANY($2::uuid[]) AND profile_id = $3`,
        [value, ids, req.params.profileId]
      );
      return res.json({ updated: ids.length });
    }
    res.status(400).json({ error: 'Unknown bulk action' });
  } catch (err) {
    next(err);
  }
});

export default router;
