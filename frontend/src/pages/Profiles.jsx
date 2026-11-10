import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const TEMPLATES = [
  {
    id: 'dispatch',
    name: '🚚 Dispatch & Freight Logistics',
    desc: 'Pre-configures MC#, DOT#, Equipment Type, Primary Lane, Fleet Size, Gross Goal.',
  },
  {
    id: 'b2b',
    name: '💼 B2B Technology & SaaS Outreach',
    desc: 'Pre-configures Contact Title, Tech Stack, Employee Count, Estimated Deal Size, Website.',
  },
  {
    id: 'medical',
    name: '🏥 Medical Billing & Healthcare',
    desc: 'Pre-configures Practice Name, Provider NPI#, Specialty, Monthly Claims, Current EHR.',
  },
  {
    id: 'realestate',
    name: '🏡 Real Estate & Property Acquisitions',
    desc: 'Pre-configures Property Type, Target Location, Budget, Pre-Approved Status.',
  },
  {
    id: 'blank',
    name: '⚡ Blank Custom Profile',
    desc: 'Start clean — fields will be created dynamically when you import your spreadsheet.',
  },
];

export default function Profiles() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('dispatch');
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(null);

  function refresh() {
    setLoading(true);
    api.listProfiles()
      .then(setProfiles)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const profile = await api.createProfile({
        name: name.trim(),
        description: description.trim(),
        template: selectedTemplate !== 'blank' ? selectedTemplate : undefined,
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      navigate(`/profiles/${profile.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingProfile) return;
    try {
      await api.updateProfile(editingProfile.id, {
        name: editingProfile.name,
        description: editingProfile.description,
      });
      setEditingProfile(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(e, profileId, profileName) {
    e.stopPropagation();
    if (!confirm(`Permanently delete campaign "${profileName}" and all its records and columns? This cannot be undone.`)) return;
    try {
      await api.deleteProfile(profileId);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Campaign Profiles</div>
          <div className="page-sub">
            Manage distinct industry campaigns (Dispatch, B2B, Medical Billing). Each profile keeps its own fields and data strictly isolated.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Campaign Profile
        </button>
      </div>

      <div className="content">
        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 44, marginBottom: 10 }}>🚀</div>
            <h3>No Campaign Profiles Yet</h3>
            <p>
              Create your first profile (e.g. "Dispatch Logistics", "B2B Tech Outreach", "Medical Billing"), then import your spreadsheets.
            </p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: 14 }}>
              Create Your First Campaign
            </button>
          </div>
        ) : (
          <div className="profile-grid">
            {profiles.map(p => (
              <div
                key={p.id}
                className="card profile-card"
                onClick={() => navigate(`/profiles/${p.id}`)}
              >
                <div className="profile-card-header">
                  <div className="profile-card-name">{p.name}</div>
                  <div className="profile-card-actions" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-action-icon"
                      title="Edit Profile"
                      onClick={() => setEditingProfile({ id: p.id, name: p.name, description: p.description || '' })}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="btn-action-icon btn-action-danger"
                      title="Delete Profile"
                      onClick={e => handleDelete(e, p.id, p.name)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="profile-card-desc">
                  {p.description || 'No description provided.'}
                </div>

                <div className="profile-card-meta">
                  <span className="profile-card-count">
                    📊 <strong>{p.record_count}</strong> leads
                  </span>
                  <span className="profile-card-fields">
                    🗂️ <strong>{p.field_count || 0}</strong> columns
                  </span>
                </div>
              </div>
            ))}

            <div className="new-profile-card" onClick={() => setShowCreate(true)}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
              <div>Create New Campaign</div>
            </div>
          </div>
        )}
      </div>

      {/* Create Profile Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="card modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">✨ Create Campaign Profile</div>
                <div className="modal-subtitle">Configure an isolated workspace for your campaign or client book</div>
              </div>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Campaign / Profile Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Dispatch Logistics, B2B Tech Outreach, Medical Billing"
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label>Description (Optional)</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this campaign targeting?"
                />
              </div>

              <div className="form-section-title" style={{ marginTop: 20 }}>
                Choose Starter Field Template
              </div>

              <div className="template-picker-grid">
                {TEMPLATES.map(tmpl => (
                  <div
                    key={tmpl.id}
                    className={`template-card ${selectedTemplate === tmpl.id ? 'active' : ''}`}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                  >
                    <div className="template-name">{tmpl.name}</div>
                    <div className="template-desc">{tmpl.desc}</div>
                  </div>
                ))}
              </div>

              <div className="modal-actions" style={{ marginTop: 24 }}>
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editingProfile && (
        <div className="modal-overlay" onClick={() => setEditingProfile(null)}>
          <div className="card modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">✏️ Edit Campaign</div>
              <button className="btn-icon" onClick={() => setEditingProfile(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="field">
                <label>Campaign Name</label>
                <input
                  value={editingProfile.name}
                  onChange={e => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Description</label>
                <input
                  value={editingProfile.description}
                  onChange={e => setEditingProfile({ ...editingProfile, description: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setEditingProfile(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
