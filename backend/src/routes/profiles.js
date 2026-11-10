import { Router } from 'express';
import { query, pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership, slugifyKey } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth);

const TEMPLATE_FIELDS = {
  dispatch: [
    { label: 'Company Name', type: 'text' },
    { label: 'Contact Name', type: 'text' },
    { label: 'Phone Number', type: 'phone' },
    { label: 'Email', type: 'email' },
    { label: 'MC Number', type: 'text' },
    { label: 'DOT Number', type: 'text' },
    { label: 'Equipment Type', type: 'text' },
    { label: 'Primary Lane', type: 'text' },
    { label: 'Fleet Size', type: 'number' },
    { label: 'Weekly Gross Goal', type: 'number' },
  ],
  b2b: [
    { label: 'Company Name', type: 'text' },
    { label: 'Contact Name', type: 'text' },
    { label: 'Job Title', type: 'text' },
    { label: 'Email', type: 'email' },
    { label: 'Phone Number', type: 'phone' },
    { label: 'Website', type: 'url' },
    { label: 'Tech Stack', type: 'text' },
    { label: 'Employees', type: 'number' },
    { label: 'Deal Size', type: 'number' },
  ],
  medical: [
    { label: 'Practice Name', type: 'text' },
    { label: 'Doctor / Provider Name', type: 'text' },
    { label: 'Specialty', type: 'text' },
    { label: 'Phone Number', type: 'phone' },
    { label: 'Email', type: 'email' },
    { label: 'NPI Number', type: 'text' },
    { label: 'Monthly Claims', type: 'number' },
    { label: 'Current EHR', type: 'text' },
  ],
  realestate: [
    { label: 'Client Name', type: 'text' },
    { label: 'Phone Number', type: 'phone' },
    { label: 'Email', type: 'email' },
    { label: 'Property Type', type: 'text' },
    { label: 'Target Location', type: 'text' },
    { label: 'Budget', type: 'number' },
    { label: 'Pre-Approved', type: 'boolean' },
    { label: 'Timeline', type: 'text' },
  ],
};

// List all profiles for the caller's company, with record count & field count
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*,
              COUNT(DISTINCT r.id)::int AS record_count,
              COUNT(DISTINCT f.id)::int AS field_count
       FROM profiles p
       LEFT JOIN records r ON r.profile_id = p.id
       LEFT JOIN fields f ON f.profile_id = p.id
       WHERE p.company_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Create a new profile (with optional template fields auto-initialization)
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, description, template } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO profiles (company_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.company_id, name.trim(), description ? description.trim() : null, req.user.user_id]
    );
    const profile = rows[0];

    // If template selected, insert pre-configured fields
    if (template && TEMPLATE_FIELDS[template]) {
      const templateDefs = TEMPLATE_FIELDS[template];
      const usedKeys = new Set();
      let order = 0;
      for (const def of templateDefs) {
        const key = slugifyKey(def.label, usedKeys);
        await client.query(
          `INSERT INTO fields (profile_id, key, label, type, order_index)
           VALUES ($1, $2, $3, $4, $5)`,
          [profile.id, key, def.label, def.type, order++]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(profile);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET single profile
router.get('/:id', async (req, res, next) => {
  try {
    const profile = await assertProfileOwnership(req.params.id, req.user.company_id);
    const { rows: stats } = await query(
      `SELECT COUNT(*)::int AS record_count FROM records WHERE profile_id = $1`,
      [profile.id]
    );
    res.json({ ...profile, record_count: stats[0]?.record_count || 0 });
  } catch (err) {
    next(err);
  }
});

// PATCH update profile name / description
router.patch('/:id', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.id, req.user.company_id);
    const { name, description } = req.body;
    const { rows } = await query(
      `UPDATE profiles SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         updated_at = now()
       WHERE id = $3 RETURNING *`,
      [name ? name.trim() : null, description !== undefined ? description : null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE profile
router.delete('/:id', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.id, req.user.company_id);
    await query('DELETE FROM profiles WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
