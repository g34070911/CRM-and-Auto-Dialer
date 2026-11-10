import { useMemo, useState } from 'react';
import { validatePhoneValues } from '../utils/phone.js';

export default function PhoneColumnPicker({ fields, records, value, onChange }) {
  const [region, setRegion] = useState('PK');
  const selectedField = fields.find(field => field.key === value);
  const validation = useMemo(() => {
    if (!selectedField) return null;
    return validatePhoneValues(records.map(record => record.data?.[selectedField.key]), region);
  }, [records, region, selectedField]);

  return (
    <div className="phone-picker card">
      <div className="phone-picker-header">
        <div>
          <div className="form-section-title">Dialer Phone Column</div>
          <div className="phone-picker-help">Select the column containing phone numbers before using the dialer.</div>
        </div>
        <label className="phone-region-control">
          Region
          <input value={region} maxLength={2} onChange={event => setRegion(event.target.value.toUpperCase())} />
        </label>
      </div>
      <select className="select-input" value={value || ''} onChange={event => onChange(event.target.value || null)}>
        <option value="">Choose a phone column...</option>
        {fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
      </select>
      {validation && (
        <div className={`phone-validation ${validation.isPhoneColumn ? 'phone-validation-valid' : 'phone-validation-invalid'}`} role="status">
          <strong>{validation.isPhoneColumn ? 'Phone column validated' : 'Selected column does not contain phone numbers'}</strong>
          <span>{validation.valid}/{validation.checked} values valid</span>
          {validation.isPhoneColumn && <span>Format: {validation.formats.join(', ') || 'Unknown'} · Region: {validation.countries.join(', ') || region}</span>}
          {!validation.isPhoneColumn && <span>Suggestion: choose a column with phone numbers, such as Phone or Mobile.</span>}
        </div>
      )}
    </div>
  );
}
