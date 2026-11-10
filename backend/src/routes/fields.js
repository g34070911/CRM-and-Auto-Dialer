import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership, slugifyKey } from '../utils/helpers.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

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
      `UPDATE fields
       SET order_index = positions.position
       FROM unnest($1::uuid[]) WITH ORDINALITY AS positions(id, position)
       WHERE fields.id = positions.id AND fields.profile_id = $2
       RETURNING fields.id`,
      [orderedIds, req.params.profileId]
    );
    if (result.rowCount !== orderedIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'orderedIds must contain fields from this profile only' });
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

// List a profile's fields in display order -- this drives the table
// columns and the filter builder on the frontend.
router.get('/', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows } = await query(
      'SELECT * FROM fields WHERE profile_id = $1 ORDER BY order_index ASC',
      [req.params.profileId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Manually add a field (as opposed to one auto-created by CSV import).
router.post('/', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { label, type, options } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });

    const { rows: existingRows } = await query('SELECT key FROM fields WHERE profile_id = $1', [req.params.profileId]);
    const usedKeys = new Set(existingRows.map(r => r.key));
    const key = slugifyKey(label, usedKeys);

    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM fields WHERE profile_id = $1',
      [req.params.profileId]
    );

    const { rows } = await query(
      `INSERT INTO fields (profile_id, key, label, type, order_index, options)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.profileId, key, label, type || 'text', maxRows[0].next_order, options ? JSON.stringify(options) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Rename a field's label, change its type, or reorder it.
router.patch('/:fieldId', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { label, type, order_index, options } = req.body;
    const { rows } = await query(
      `UPDATE fields SET
         label = COALESCE($1, label),
         type = COALESCE($2, type),
         order_index = COALESCE($3, order_index),
         options = COALESCE($4, options)
       WHERE id = $5 AND profile_id = $6 RETURNING *`,
      [label, type, order_index, options ? JSON.stringify(options) : null, req.params.fieldId, req.params.profileId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Field not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:fieldId', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows } = await query(
      'DELETE FROM fields WHERE id = $1 AND profile_id = $2 AND (is_system = false OR is_system IS NULL) RETURNING id',
      [req.params.fieldId, req.params.profileId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Field not found or is a system field' });
    res.json({ deleted: true, id: rows[0].id });
  } catch (err) { next(err); }
});

export default router;
