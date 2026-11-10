import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const STATUS_STEPS = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];

export default function LeadDrawer({ profileId, recordId, fields, onClose, onUpdated, onDeleted }) {
  const { team } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editData, setEditData] = useState({});
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    setError('');
    api.getRecord(profileId, recordId)
      .then(r => {
        setRecord(r);
        setEditData(r.data || {});
        setTags(r.tags || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [profileId, recordId]);

  function handleDataFieldChange(key, value) {
    setEditData(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateRecord(profileId, recordId, {
        data: editData,
        tags,
      });
      setRecord(updated);
      setSuccessMsg('Changes saved!');
      setTimeout(() => setSuccessMsg(''), 2500);
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const updated = await api.updateRecord(profileId, recordId, { status: newStatus });
      setRecord(prev => ({ ...prev, status: newStatus }));
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignChange(userId) {
    try {
      const updated = await api.updateRecord(profileId, recordId, { assigned_to: userId || null });
      setRecord(prev => ({ ...prev, assigned_to: userId || null }));
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAddTag(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/,/g, '');
      if (val && !tags.includes(val)) {
        const nextTags = [...tags, val];
        setTags(nextTags);
        api.updateRecord(profileId, recordId, { tags: nextTags }).then(onUpdated).catch(() => {});
      }
      setTagInput('');
    }
  }

  function removeTag(tagToRemove) {
    const nextTags = tags.filter(t => t !== tagToRemove);
    setTags(nextTags);
    api.updateRecord(profileId, recordId, { tags: nextTags }).then(onUpdated).catch(() => {});
  }

  async function handleClone() {
    try {
      await api.cloneRecord(profileId, recordId);
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to permanently delete this lead?')) return;
    try {
      await api.deleteRecord(profileId, recordId);
      onDeleted(recordId);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  // Find primary title from first text field
  const primaryField = fields[0]?.key;
  const primaryTitle = (record?.data?.[primaryField]) || `Lead #${record?.id?.slice(0, 8) || ''}`;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="drawer-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : error && !record ? (
          <div className="drawer-body">
            <div className="error-banner">{error}</div>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className="drawer-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="drawer-badge-row">
                  <span className={`badge badge-${record.status}`}>{record.status}</span>
                  <span className="drawer-source-badge">📍 {record.source || 'Direct'}</span>
                </div>
                <div className="drawer-title" title={primaryTitle}>{primaryTitle}</div>
                <div className="drawer-subtitle">
                  Created {new Date(record.created_at).toLocaleDateString()} · Last updated {new Date(record.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button className="btn-icon" onClick={onClose} title="Close">✕</button>
            </div>

            {error && <div className="error-banner" style={{ margin: '10px 20px 0' }}>{error}</div>}
            {successMsg && <div className="success-banner" style={{ margin: '10px 20px 0' }}>{successMsg}</div>}

            <div className="drawer-body">
              {/* Pipeline Progress Stages */}
              <div className="drawer-section">
                <div className="drawer-section-label">Pipeline Stage Progression</div>
                <div className="pipeline-steps">
                  {STATUS_STEPS.map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`pipeline-step-btn ${record.status === s ? 'active' : ''} step-${s}`}
                      onClick={() => handleStatusChange(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Communication Actions */}
              <div className="drawer-section">
                <div className="drawer-section-label">Quick Actions</div>
                <div className="quick-action-bar">
                  {Object.entries(record.data || {}).map(([k, v]) => {
                    if (/@/.test(String(v))) {
                      return (
                        <a key={k} href={`mailto:${v}`} className="btn btn-sm btn-action">
                          ✉️ Email ({v})
                        </a>
                      );
                    }
                    if (k.toLowerCase().includes('phone') && v) {
                      return (
                        <a key={k} href={`tel:${v}`} className="btn btn-sm btn-action">
                          📞 Call ({v})
                        </a>
                      );
                    }
                    return null;
                  })}
                  <button className="btn btn-sm" onClick={handleClone} title="Create a duplicate lead">
                    📄 Clone Lead
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={handleDelete} title="Delete lead">
                    🗑️ Delete
                  </button>
                </div>
              </div>

              {/* Assignment & Tags */}
              <div className="drawer-section">
                <div className="drawer-section-label">Ownership & Classification</div>
                <div className="form-grid-2" style={{ gap: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Assigned Rep</label>
                    <select
                      value={record.assigned_to || ''}
                      onChange={e => handleAssignChange(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {team.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Lead Source</label>
                    <input value={record.source || ''} disabled style={{ opacity: 0.8 }} />
                  </div>
                </div>

                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label>Tags</label>
                  <div className="tag-input-container">
                    <div className="tag-list">
                      {tags.map(t => (
                        <span key={t} className="tag-chip active">
                          {t} <span className="tag-remove" onClick={() => removeTag(t)}>×</span>
                        </span>
                      ))}
                    </div>
                    <input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={handleAddTag}
                      placeholder="Add tag and press Enter..."
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Field Attributes */}
              <div className="drawer-section">
                <div className="drawer-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Custom Dynamic Fields ({fields.length})</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : '💾 Save Fields'}
                  </button>
                </div>

                {fields.length === 0 ? (
                  <div className="empty-subtext">No dynamic fields defined.</div>
                ) : (
                  <div className="drawer-fields-list">
                    {fields.map(f => (
                      <div key={f.key} className="drawer-field-row">
                        <div className="drawer-field-label">
                          {f.label}
                          <span className="field-type-tag">{f.type}</span>
                        </div>
                        <div className="drawer-field-input-wrap">
                          {f.type === 'boolean' ? (
                            <select
                              value={editData[f.key] ?? ''}
                              onChange={e => handleDataFieldChange(f.key, e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          ) : f.type === 'date' ? (
                            <input
                              type="date"
                              value={editData[f.key] ?? ''}
                              onChange={e => handleDataFieldChange(f.key, e.target.value)}
                            />
                          ) : f.type === 'number' ? (
                            <input
                              type="number"
                              step="any"
                              value={editData[f.key] ?? ''}
                              onChange={e => handleDataFieldChange(f.key, e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              value={editData[f.key] ?? ''}
                              onChange={e => handleDataFieldChange(f.key, e.target.value)}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving Changes...' : 'Save All Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
