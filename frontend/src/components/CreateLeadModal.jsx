import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];

export default function CreateLeadModal({ profileId, fields, onClose, onCreated }) {
  const { team } = useAuth();
  const [formData, setFormData] = useState({});
  const [status, setStatus] = useState('New');
  const [assignedTo, setAssignedTo] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [source, setSource] = useState('Manual Entry');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleDataChange(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  function handleAddTag(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/,/g, '');
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
      }
      setTagInput('');
    }
  }

  function removeTag(tagToRemove) {
    setTags(tags.filter(t => t !== tagToRemove));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.createRecord(profileId, {
        data: formData,
        status,
        assigned_to: assignedTo || null,
        tags,
        source: source || 'Manual Entry',
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">✨ Add New Lead</div>
            <div className="modal-subtitle">Enter lead details according to your campaign field structure</div>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-section-title">Standard CRM Attributes</div>
          <div className="form-grid-2">
            <div className="field">
              <label>Pipeline Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Assigned Agent</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {team.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Lead Source</label>
              <input
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="e.g. Inbound Call, Website, Referral"
              />
            </div>

            <div className="field">
              <label>Tags (press Enter to add)</label>
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
                  placeholder={tags.length === 0 ? "e.g. VIP, Urgent, FollowUp" : "Add more tags..."}
                />
              </div>
            </div>
          </div>

          <div className="form-section-title" style={{ marginTop: 20 }}>
            Dynamic Campaign Fields ({fields.length})
          </div>

          {fields.length === 0 ? (
            <div className="empty-subtext">No dynamic fields defined yet. They will be created when you add them or import a spreadsheet.</div>
          ) : (
            <div className="form-grid-2">
              {fields.map(field => (
                <div key={field.key} className="field">
                  <label>
                    {field.label}
                    <span className="field-type-tag">{field.type}</span>
                  </label>
                  {field.type === 'boolean' ? (
                    <select
                      value={formData[field.key] ?? ''}
                      onChange={e => handleDataChange(field.key, e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  ) : field.type === 'date' ? (
                    <input
                      type="date"
                      value={formData[field.key] ?? ''}
                      onChange={e => handleDataChange(field.key, e.target.value)}
                    />
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      step="any"
                      value={formData[field.key] ?? ''}
                      onChange={e => handleDataChange(field.key, e.target.value)}
                      placeholder={`Enter ${field.label}...`}
                    />
                  ) : field.type === 'email' ? (
                    <input
                      type="email"
                      value={formData[field.key] ?? ''}
                      onChange={e => handleDataChange(field.key, e.target.value)}
                      placeholder="name@company.com"
                    />
                  ) : field.type === 'phone' ? (
                    <input
                      type="tel"
                      value={formData[field.key] ?? ''}
                      onChange={e => handleDataChange(field.key, e.target.value)}
                      placeholder="+1 (555) 000-0000"
                    />
                  ) : (
                    <input
                      type="text"
                      value={formData[field.key] ?? ''}
                      onChange={e => handleDataChange(field.key, e.target.value)}
                      placeholder={`Enter ${field.label}...`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating Lead...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
