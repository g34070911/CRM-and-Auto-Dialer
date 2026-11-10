import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export const DEFAULT_PHONE_REGION = import.meta.env.VITE_PHONE_REGION || 'PK';

export function normalizePhone(value, defaultRegion = DEFAULT_PHONE_REGION) {
  const raw = String(value ?? '').trim();
  if (!raw) return { valid: false, raw, reason: 'empty' };
  try {
    const parsed = parsePhoneNumberFromString(raw, defaultRegion);
    if (!parsed || !parsed.isValid()) return { valid: false, raw, reason: 'invalid' };
    return { valid: true, raw, e164: parsed.number, country: parsed.country || null, format: parsed.number.startsWith('+') ? 'E.164' : 'National' };
  } catch {
    return { valid: false, raw, reason: 'invalid' };
  }
}

export function validatePhoneValues(values, defaultRegion = DEFAULT_PHONE_REGION) {
  const results = values.map(value => normalizePhone(value, defaultRegion)).filter(result => result.raw);
  const valid = results.filter(result => result.valid);
  return {
    checked: results.length,
    valid: valid.length,
    invalid: results.length - valid.length,
    isPhoneColumn: results.length > 0 && valid.length / results.length >= 0.8,
    formats: [...new Set(valid.map(result => result.format))],
    countries: [...new Set(valid.map(result => result.country).filter(Boolean))],
    sample: valid.slice(0, 5),
  };
}
