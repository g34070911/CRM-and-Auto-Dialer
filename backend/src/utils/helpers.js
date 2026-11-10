import { query } from '../db.js';

// Turn a spreadsheet header like "Phone Number" -> "phone_number"
// Guarantees uniqueness against a set of keys already used in this import.
export function slugifyKey(label, usedKeys) {
  let base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = 'field';
  let key = base;
  let i = 2;
  while (usedKeys.has(key)) {
    key = `${base}_${i}`;
    i++;
  }
  usedKeys.add(key);
  return key;
}

// Guess a field type from a column of sample values.
export function inferType(samples) {
  const nonEmpty = samples.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'text';

  const isEmail = nonEmpty.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()));
  if (isEmail) return 'email';

  const isPhone = nonEmpty.every(v => /^[+\d][\d\s\-().]{6,}$/.test(String(v).trim()));
  if (isPhone) return 'phone';

  const isCurrency = nonEmpty.every(v => /^\s*[$€£¥]\s*[0-9,]+(\.[0-9]{1,2})?\s*$/.test(String(v).trim()));
  if (isCurrency) return 'number';

  const isNumber = nonEmpty.every(v => {
    const clean = String(v).replace(/[$,]/g, '').trim();
    return clean !== '' && !isNaN(Number(clean));
  });
  if (isNumber) return 'number';

  const isDate = nonEmpty.every(v => {
    const s = String(v).trim();
    return !isNaN(Date.parse(s)) && /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s);
  });
  if (isDate) return 'date';

  const isBoolean = nonEmpty.every(v => ['true', 'false', 'yes', 'no', '0', '1', 'y', 'n'].includes(String(v).toLowerCase().trim()));
  if (isBoolean) return 'boolean';

  const isUrl = nonEmpty.every(v => /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(String(v).trim()));
  if (isUrl) return 'url';

  return 'text';
}

// Confirms the profile exists AND belongs to the caller's company.
export async function assertProfileOwnership(profileId, companyId) {
  const { rows } = await query(
    'SELECT * FROM profiles WHERE id = $1 AND company_id = $2',
    [profileId, companyId]
  );
  if (rows.length === 0) {
    const err = new Error('Profile not found or access denied');
    err.status = 404;
    throw err;
  }
  return rows[0];
}
