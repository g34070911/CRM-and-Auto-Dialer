import { Router } from 'express';
import XLSX from 'xlsx';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership } from '../utils/helpers.js';
import { buildFilters } from './records.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /api/profiles/:profileId/export?format=csv|xlsx&status=...&search=...&filters=...
router.get('/', async (req, res, next) => {
  try {
    const profile = await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const format = (req.query.format || 'csv').toLowerCase();

    // Fetch dynamic field definitions in proper order_index sequence
    const { rows: fields } = await query(
      'SELECT * FROM fields WHERE profile_id = $1 ORDER BY order_index ASC',
      [profile.id]
    );

    // Build filter query identical to record listing
    const { clause, values } = buildFilters(req.query, 2);
    const params = [profile.id, ...values];

    const { rows: records } = await query(
      `SELECT * FROM records WHERE profile_id = $1 ${clause} ORDER BY created_at DESC`,
      params
    );

    // Build structured data array with friendly headers
    const exportRows = records.map(r => {
      const row = {
        'Status': r.status,
      };

      // Add each dynamic field in order
      for (const f of fields) {
        row[f.label] = r.data?.[f.key] !== undefined && r.data?.[f.key] !== null ? r.data[f.key] : '';
      }

      row['Tags'] = Array.isArray(r.tags) ? r.tags.join(', ') : '';
      row['Source'] = r.source || '';
      row['Created At'] = new Date(r.created_at).toISOString();
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

    const cleanProfileName = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanProfileName}_Export_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'xlsx' || format === 'excel') {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.send(buffer);
    }

    // Default CSV
    const csvBuffer = XLSX.utils.sheet_to_csv(worksheet);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(csvBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;
