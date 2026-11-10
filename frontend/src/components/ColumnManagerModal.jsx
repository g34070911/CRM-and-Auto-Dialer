import { useState } from 'react';
import { api } from '../api.js';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean (Yes/No)' },
  { value: 'url', label: 'URL / Link' },
];

export default function ColumnManagerModal({ profileId, fields, onClose, onUpdated }) {
  const [fieldList, setFieldList] = useState(fields);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);

  async function handleAddField(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setLoading(true);
    setError('');
    try {
      const created = await api.createField(profileId, {
        label: newLabel.trim(),
        type: newType,
      });
      setFieldList(prev => [...prev, created]);
      setNewLabel('');
      setNewType('text');
      setSuccess('Field added successfully!');
      setTimeout(() => setSuccess(''), 2000);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMove(index, direction) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= fieldList.length) return;

    const previousList = [...fieldList];
    const list = [...fieldList];
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    setFieldList(list);

    await persistOrder(list, previousList);
  }

  async function persistOrder(list, previousList) {
    setError('');
    try {
      await api.reorderFields(profileId, list.map(field => field.id));
      onUpdated();
    } catch (err) {
      if (previousList) setFieldList(previousList);
      setError(err.message);
    }
  }

  function handleColumnDrop(targetIndex) {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const previousList = [...fieldList];
    const list = [...fieldList];
    const [moved] = list.splice(draggedIndex, 1);
    list.splice(targetIndex, 0, moved);
    setFieldList(list);
    setDraggedIndex(null);
    persistOrder(list, previousList);
  }

  async function handleDeleteField(fieldId, fieldLabel) {
    if (!confirm(`Delete column "${fieldLabel}"? This will remove the column from the table view.`)) return;
    // Optimistically remove from local list
    const previousList = [...fieldList];
    setFieldList(prev => prev.filter(f => f.id !== fieldId));
    try {
      await api.deleteField(profileId, fieldId);
      setSuccess(`Column "${fieldLabel}" deleted successfully.`);
      setTimeout(() => setSuccess(''), 2000);
      onUpdated();
    } catch (err) {
      // Revert on failure
      setFieldList(previousList);
      setError(`Failed to delete column: ${err.message}`);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">⚙️ Customize Columns & Fields</div>
            <div className="modal-subtitle">Manage column ordering, names, and data types for this campaign</div>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {/* Add New Field Form */}
        <form onSubmit={handleAddField} className="card add-field-box">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--ink)' }}>+ Add New Column</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ flex: 1, minWidth: 160 }}
              placeholder="Column Name (e.g. MC Number, Monthly Claims, Budget)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              required
            />
            <select
              style={{ width: 140 }}
              value={newType}
              onChange={e => setNewType(e.target.value)}
            >
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button type="submit" className="btn btn-primary" disabled={loading || !newLabel.trim()}>
              {loading ? 'Adding...' : 'Add Column'}
            </button>
          </div>
        </form>

        {/* Existing Columns List */}
        <div style={{ marginTop: 20 }}>
          <div className="form-section-title">Current Columns ({fieldList.length})</div>
          <div className="column-manager-list">
            {fieldList.length === 0 ? (
              <div className="empty-subtext">No columns defined yet. Add one above or import a spreadsheet.</div>
            ) : (
              fieldList.map((f, idx) => (
                <div
                  key={f.id}
                  className="column-manager-item"
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', f.id);
                    setDraggedIndex(idx);
                  }}
                  onDragEnd={() => setDraggedIndex(null)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleColumnDrop(idx); }}
                >
                  <div className="column-drag-handle" title="Drag to reorder column">☰</div>
                  <div className="column-info">
                    <div className="column-name">{f.label}</div>
                    <div className="column-meta">Key: <code>{f.key}</code> · Order: {idx + 1}</div>
                  </div>
                  <span className="field-type-tag">{f.type}</span>
                  <div className="column-item-actions">
                    <button
                      type="button"
                      className="btn-icon-sm"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, -1)}
                      title="Move Left / Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn-icon-sm"
                      disabled={idx === fieldList.length - 1}
                      onClick={() => handleMove(idx, 1)}
                      title="Move Right / Down"
                    >
                      ▼
                    </button>
                    {!f.is_system && (
                      <button
                        type="button"
                        className="btn-icon-sm btn-icon-danger"
                        onClick={() => handleDeleteField(f.id, f.label)}
                        title="Delete Column"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 24 }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
