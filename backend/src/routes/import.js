import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership, slugifyKey, inferType } from '../utils/helpers.js';
import { validatePhoneValues } from '../utils/phone.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Parses .csv, .xlsx, .xls into { headers: string[], rows: object[] }
// Strips UTF-8 BOM, preserves exact column sequence and blank cells
export function parseFile(buffer, originalName) {
  const nameLower = originalName.toLowerCase();
  const isCsv = nameLower.endsWith('.csv') || nameLower.endsWith('.txt') || nameLower.endsWith('.tsv');

  if (isCsv) {
    let text = buffer.toString('utf8');
    // Strip BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    // Also handle \r\n and clean empty trailing lines
    const records = parse(text, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    });
    if (records.length === 0) return { headers: [], rows: [] };

    // Extract headers preserving exact sequence
    const rawHeaders = records[0];
    const headers = rawHeaders.map((h, i) => {
      const clean = String(h || '').trim();
      return clean !== '' ? clean : `Column_${i + 1}`;
    });

    const rows = records.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        const val = r[i];
        obj[h] = (val !== undefined && val !== null) ? String(val).trim() : '';
      });
      return obj;
    });

    return { headers, rows };
  }

  // xlsx / xls
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (json.length === 0) return { headers: [], rows: [] };

  const rawHeaders = json[0];
  const headers = rawHeaders.map((h, i) => {
    const clean = String(h || '').trim();
    return clean !== '' ? clean : `Column_${i + 1}`;
  });

  const rows = json.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      const val = r[i];
      obj[h] = (val !== undefined && val !== null) ? String(val).trim() : '';
    });
    return obj;
  });

  return { headers, rows };
}

// POST /api/profiles/:profileId/import/preview
// Reads the file buffer and returns detected columns, sample rows, and suggested field types
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

    const { headers, rows } = parseFile(req.file.buffer, req.file.originalname);
    if (headers.length === 0) {
      return res.status(400).json({ error: 'File appears to be empty or has no header row' });
    }

    const previewFields = headers.map((header, idx) => {
      const samples = rows.slice(0, 30).map(r => r[header]);
      const inferred = inferType(samples);
      const phoneValidation = validatePhoneValues(rows.slice(0, 100).map(r => r[header]));
      return {
        header,
        order: idx + 1,
        inferredType: inferred,
        sampleValues: samples.slice(0, 3),
        phoneValidation,
      };
    });

    res.json({
      filename: req.file.originalname,
      totalRows: rows.length,
      fields: previewFields,
      previewRows: rows.slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/profiles/:profileId/import
// Executes the full import, syncing fields in exact left-to-right order and inserting records
router.post('/', upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const profile = await assertProfileOwnership(req.params.profileId, req.user.company_id);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

    const { headers, rows } = parseFile(req.file.buffer, req.file.originalname);
    if (headers.length === 0) {
      return res.status(400).json({ error: 'File appears to be empty or has no header row' });
    }
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows found below the header' });
    }
    if (rows.length > 50000) {
      return res.status(400).json({ error: 'File exceeds 50,000 rows limit; please import in smaller batches' });
    }

    await client.query('BEGIN');

    // Check if profile already had records
    const { rows: recordCheck } = await client.query(
      'SELECT COUNT(*)::int AS count FROM records WHERE profile_id = $1',
      [profile.id]
    );
    const hasExistingRecords = (recordCheck[0]?.count || 0) > 0;

    const { rows: existingFields } = await client.query(
      'SELECT * FROM fields WHERE profile_id = $1',
      [profile.id]
    );
    const existingFieldByLabel = new Map(existingFields.map(f => [f.label.trim().toLowerCase(), f]));
    const existingFieldByKey = new Map(existingFields.map(f => [f.key.trim().toLowerCase(), f]));
    const usedKeys = new Set(existingFields.map(f => f.key));

    const fieldDefs = headers.map((header, order) => {
      const headerLower = header.toLowerCase().trim();
      const existing = existingFieldByLabel.get(headerLower) || existingFieldByKey.get(slugifyKey(header, new Set()));
      return existing
        ? { header, order, key: existing.key, field: existing }
        : { header, order, key: slugifyKey(header, usedKeys), type: inferType(rows.slice(0, 30).map(r => r[header])) };
    });

    const existingDefs = fieldDefs.filter(def => def.field);
    if (existingDefs.length) {
      await client.query(
        `UPDATE fields
         SET label = updates.label, order_index = updates.order_index
         FROM unnest($1::uuid[], $2::text[], $3::int[]) AS updates(id, label, order_index)
         WHERE fields.id = updates.id AND fields.profile_id = $4`,
        [existingDefs.map(def => def.field.id), existingDefs.map(def => def.header), existingDefs.map(def => def.order), profile.id]
      );
    }

    const newDefs = fieldDefs.filter(def => !def.field);
    if (newDefs.length) {
      const inserted = await client.query(
        `INSERT INTO fields (profile_id, key, label, type, order_index)
         SELECT $1, new_fields.key, new_fields.label, new_fields.type, new_fields.order_index
         FROM unnest($2::text[], $3::text[], $4::text[], $5::int[]) AS new_fields(key, label, type, order_index)
         RETURNING *`,
        [profile.id, newDefs.map(def => def.key), newDefs.map(def => def.header), newDefs.map(def => def.type), newDefs.map(def => def.order)]
      );
      const insertedByKey = new Map(inserted.rows.map(field => [field.key, field]));
      for (const def of newDefs) def.field = insertedByKey.get(def.key);
    }

    const activeFieldIds = new Set(fieldDefs.map(def => def.field.id));
    const headerToKey = fieldDefs.map(({ header, key }) => ({ header, key }));

    // If profile had 0 previous records, delete any placeholder template fields not present in this sheet
    if (!hasExistingRecords) {
      await client.query(
        `DELETE FROM fields WHERE profile_id = $1 AND NOT (id = ANY($2::uuid[]))`,
        [profile.id, [...activeFieldIds]]
      );
    } else {
      // If there were existing records, push remaining non-sheet fields to the end
      let extraOrder = headers.length;
      for (const ef of existingFields) {
        if (!activeFieldIds.has(ef.id)) {
          await client.query(
            `UPDATE fields SET order_index = $1 WHERE id = $2`,
            [extraOrder++, ef.id]
          );
        }
      }
    }

    const batch = await client.query(
      `INSERT INTO import_batches (profile_id, filename, row_count, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [profile.id, req.file.originalname, rows.length, req.user.user_id]
    );

    const recordData = rows.map(row => {
      const data = {};
      for (const { header, key } of headerToKey) {
        const val = row[header];
        data[key] = (val !== undefined && val !== null) ? String(val).trim() : '';
      }
      return data;
    });

    // Send one parameterized query instead of one database round trip per row.
    await client.query(
      `WITH base_order AS (
         SELECT COALESCE(MAX(row_order), -1) AS value
         FROM records
         WHERE profile_id = $1
       ), incoming AS (
         SELECT data, position
         FROM unnest($2::jsonb[]) WITH ORDINALITY AS rows(data, position)
       )
       INSERT INTO records (profile_id, data, source, import_batch_id, created_by, row_order)
       SELECT $1, incoming.data, $3, $4, $5, base_order.value + incoming.position
       FROM incoming
       CROSS JOIN base_order
       ORDER BY incoming.position`,
      [
        profile.id,
        recordData.map(data => JSON.stringify(data)),
        `import: ${req.file.originalname}`,
        batch.rows[0].id,
        req.user.user_id,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({
      batch: batch.rows[0],
      fieldsCreated: headers.length,
      rowsImported: rows.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;
