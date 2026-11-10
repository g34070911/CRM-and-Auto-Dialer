import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];

const OPS_BY_TYPE = {
  text: [
    ['contains', 'contains'],
    ['not_contains', 'does not contain'],
    ['eq', 'is exactly'],
    ['starts_with', 'starts with'],
    ['ends_with', 'ends with'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ],
  email: [
    ['contains', 'contains'],
    ['eq', 'is exactly'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ],
  phone: [
    ['contains', 'contains'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ],
  number: [
    ['gte', '≥ (at least)'],
    ['lte', '≤ (at most)'],
    ['gt', '> (greater than)'],
    ['lt', '< (less than)'],
    ['eq', '= (equals)'],
    ['neq', '≠ (not equal)'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ],
  date: [
    ['date_gte', 'on or after'],
    ['date_lte', 'on or before'],
    ['date_eq', 'is on'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ],
  boolean: [
    ['eq', 'is'],
    ['is_empty', 'is empty'],
  ],
  url: [
    ['contains', 'contains'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ],
};

export default function FilterPanel({ profileId, fields, value, onChange }) {
  const [draft, setDraft] = useState({ key: fields[0]?.key || '', op: 'contains', value: '' });
  const [savedFilters, setSavedFilters] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [quickDate, setQuickDate] = useState('');

  // Update default key when fields load
  useEffect(() => {
    if (fields.length > 0 && !draft.key) {
      const firstField = fields[0];
      const initialOps = OPS_BY_TYPE[firstField.type] || OPS_BY_TYPE.text;
      setDraft({ key: firstField.key, op: initialOps[0][0], value: '' });
    }
  }, [fields, draft.key]);

  const loadSavedPresets = useCallback(async () => {
    if (!profileId) return;
    try {
      const presets = await api.listSavedFilters(profileId);
      setSavedFilters(presets);
    } catch {
      // ignore
    }
  }, [profileId]);

  useEffect(() => {
    loadSavedPresets();
  }, [loadSavedPresets]);

  function update(patch) {
    onChange({ ...value, ...patch });
  }

  function handleFieldSelectChange(e) {
    const key = e.target.value;
    const selectedField = fields.find(f => f.key === key);
    const ops = OPS_BY_TYPE[selectedField?.type] || OPS_BY_TYPE.text;
    setDraft({ key, op: ops[0][0], value: '' });
  }

  function addFieldFilter() {
    if (!draft.key) return;
    const noValueOps = ['is_empty', 'is_not_empty'];
    if (!noValueOps.includes(draft.op) && (draft.value === '' || draft.value === undefined)) return;

    const next = [...(value.filters || []), draft];
    update({ filters: next });
    const selectedField = fields.find(f => f.key === draft.key);
    const ops = OPS_BY_TYPE[selectedField?.type] || OPS_BY_TYPE.text;
    setDraft({ key: draft.key, op: ops[0][0], value: '' });
  }

  function removeFieldFilter(idx) {
    const next = (value.filters || []).filter((_, i) => i !== idx);
    update({ filters: next });
  }

  function handleQuickDateChange(range) {
    setQuickDate(range);
    const now = new Date();
    if (range === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      update({ date_from: todayStr, date_to: todayStr });
    } else if (range === '7d') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      update({ date_from: past7, date_to: '' });
    } else if (range === '30d') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      update({ date_from: past30, date_to: '' });
    } else if (range === 'all') {
      update({ date_from: '', date_to: '' });
    }
  }

  function handleClearAll() {
    setQuickDate('');
    onChange({});
  }

  async function handleSavePreset(e) {
    e.preventDefault();
    if (!presetName.trim()) return;
    try {
      const created = await api.createSavedFilter(profileId, {
        name: presetName.trim(),
        conditions: value,
      });
      setSavedFilters(prev => [created, ...prev]);
      setPresetName('');
      setShowSavePreset(false);
    } catch (err) {
      alert(err.message);
    }
  }

  function applyPreset(preset) {
    const conditions = typeof preset.conditions === 'string' ? JSON.parse(preset.conditions) : preset.conditions;
    onChange(conditions || {});
  }

  async function handleDeletePreset(e, presetId) {
    e.stopPropagation();
    try {
      await api.deleteSavedFilter(profileId, presetId);
      setSavedFilters(prev => prev.filter(p => p.id !== presetId));
    } catch (err) {
      alert(err.message);
    }
  }

  const selectedField = fields.find(f => f.key === draft.key);
  const ops = OPS_BY_TYPE[selectedField?.type] || OPS_BY_TYPE.text;
  const isNoValOp = draft.op === 'is_empty' || draft.op === 'is_not_empty';

  const hasActiveFilters = Boolean(
    value.status ||
    value.date_from ||
    value.date_to ||
    value.tags ||
    value.source ||
    (value.filters && value.filters.length > 0)
  );

  return (
    <div className="card filter-panel">
      {/* Top Filter Bar */}
      <div className="filter-row" style={{ flexWrap: 'wrap', gap: 10 }}>
        {/* Status Filter */}
        <select
          className="select-input"
          value={value.status || ''}
          onChange={e => update({ status: e.target.value })}
        >
          <option value="">🎯 All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Date Quick Range */}
        <select
          className="select-input"
          value={quickDate}
          onChange={e => handleQuickDateChange(e.target.value)}
        >
          <option value="">📅 Date: Any Time</option>
          <option value="today">Created Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="custom">Custom Date Range</option>
        </select>

        {(quickDate === 'custom' || value.date_from || value.date_to) && (
          <div className="filter-date-inputs">
            <input
              className="select-input"
              type="date"
              value={value.date_from || ''}
              onChange={e => update({ date_from: e.target.value })}
              title="Created From"
            />
            <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>to</span>
            <input
              className="select-input"
              type="date"
              value={value.date_to || ''}
              onChange={e => update({ date_to: e.target.value })}
              title="Created To"
            />
          </div>
        )}

        {/* Tags Filter */}
        <input
          className="select-input"
          placeholder="🏷️ Filter by Tag..."
          value={value.tags || ''}
          onChange={e => update({ tags: e.target.value })}
          style={{ width: 140 }}
        />

        {/* Source Filter */}
        <input
          className="select-input"
          placeholder="📍 Source contains..."
          value={value.source || ''}
          onChange={e => update({ source: e.target.value })}
          style={{ width: 150 }}
        />

        {/* Saved Views Dropdown */}
        {savedFilters.length > 0 && (
          <div className="saved-views-dropdown-wrap">
            <select
              className="select-input saved-views-select"
              onChange={e => {
                const match = savedFilters.find(p => p.id === e.target.value);
                if (match) applyPreset(match);
              }}
              defaultValue=""
            >
              <option value="" disabled>📁 Saved Views ({savedFilters.length})</option>
              {savedFilters.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {hasActiveFilters && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowSavePreset(true)}
              title="Save current filter combination as a preset"
            >
              💾 Save View
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleClearAll}
              style={{ color: 'var(--red)' }}
            >
              ✕ Clear All
            </button>
          </>
        )}
      </div>

      {/* Dynamic Per-Field Filter Rule Builder */}
      {fields.length > 0 && (
        <div className="filter-row dynamic-filter-row">
          <span className="filter-label-accent">⚡ Field Filter:</span>
          <select value={draft.key} onChange={handleFieldSelectChange}>
            {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>

          <select value={draft.op} onChange={e => setDraft(d => ({ ...d, op: e.target.value }))}>
            {ops.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>

          {!isNoValOp && (
            <input
              value={draft.value}
              onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') addFieldFilter(); }}
              placeholder="Value to match..."
              style={{ width: 150 }}
            />
          )}

          <button type="button" className="btn btn-sm btn-primary" onClick={addFieldFilter}>
            + Apply Condition
          </button>
        </div>
      )}

      {/* Active Filter Chips */}
      {(value.filters || []).length > 0 && (
        <div className="filter-row active-chips-row">
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
            Active Field Conditions:
          </span>
          {value.filters.map((f, idx) => {
            const fieldLabel = fields.find(fl => fl.key === f.key)?.label || f.key;
            const opLabel = (OPS_BY_TYPE[fields.find(fl => fl.key === f.key)?.type] || OPS_BY_TYPE.text).find(o => o[0] === f.op)?.[1] || f.op;
            return (
              <span key={idx} className="tag-chip active-filter-chip" onClick={() => removeFieldFilter(idx)}>
                <strong>{fieldLabel}</strong> {opLabel} {f.op !== 'is_empty' && f.op !== 'is_not_empty' ? `"${f.value}"` : ''}
                <span className="chip-remove">×</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Save Preset Dialog */}
      {showSavePreset && (
        <div className="save-preset-dialog">
          <form onSubmit={handleSavePreset} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Save Preset:</span>
            <input
              placeholder="e.g. High Budget Dispatch Leads"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              autoFocus
              required
              style={{ padding: '5px 8px', fontSize: 12.5 }}
            />
            <button type="submit" className="btn btn-sm btn-primary">Save View</button>
            <button type="button" className="btn btn-sm" onClick={() => setShowSavePreset(false)}>Cancel</button>
          </form>
        </div>
      )}
    </div>
  );
}
