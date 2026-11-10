import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export const DEFAULT_PHONE_REGION = process.env.DEFAULT_PHONE_REGION || 'PK';

export function normalizePhone(value, defaultRegion = DEFAULT_PHONE_REGION) {
  const raw = String(value ?? '').trim();
  if (!raw) return { valid: false, raw, reason: 'empty' };

  try {
    const parsed = parsePhoneNumberFromString(raw, defaultRegion);
    if (!parsed || !parsed.isValid()) return { valid: false, raw, reason: 'invalid' };
    return {
      valid: true,
      raw,
      e164: parsed.number,
      country: parsed.country || null,
      format: parsed.number.startsWith('+') ? 'E.164' : 'National',
    };
  } catch {
    return { valid: false, raw, reason: 'invalid' };
  }
}

export function validatePhoneValues(values, defaultRegion = DEFAULT_PHONE_REGION) {
  const nonEmpty = values.map(value => normalizePhone(value, defaultRegion)).filter(result => result.raw);
  const valid = nonEmpty.filter(result => result.valid);
  const formats = [...new Set(valid.map(result => result.format))];
  const countries = [...new Set(valid.map(result => result.country).filter(Boolean))];

  return {
    checked: nonEmpty.length,
    valid: valid.length,
    invalid: nonEmpty.length - valid.length,
    isPhoneColumn: nonEmpty.length > 0 && valid.length / nonEmpty.length >= 0.8,
    formats,
    countries,
    sample: valid.slice(0, 5),
  };
}
