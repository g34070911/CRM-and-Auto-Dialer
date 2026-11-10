import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership } from '../utils/helpers.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET all saved filters for this profile (scoped to user or company)
router.get('/', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows } = await query(
      `SELECT * FROM saved_filters
       WHERE profile_id = $1 AND (user_id = $2 OR user_id IS NULL)
       ORDER BY created_at DESC`,
      [req.params.profileId, req.user.user_id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST create a new saved filter preset
router.post('/', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { name, conditions } = req.body;
    if (!name) return res.status(400).json({ error: 'Filter preset name is required' });

    const { rows } = await query(
      `INSERT INTO saved_filters (profile_id, user_id, name, conditions)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.profileId, req.user.user_id, name, JSON.stringify(conditions || {})]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE a saved filter preset
router.delete('/:filterId', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { rows } = await query(
      `DELETE FROM saved_filters
       WHERE id = $1 AND profile_id = $2
       RETURNING id`,
      [req.params.filterId, req.params.profileId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Saved filter not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
