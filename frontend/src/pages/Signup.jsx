import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

const INDUSTRIES = [
  'Logistics / Freight / Dispatch',
  'B2B Technology / SaaS',
  'Medical Billing / Healthcare',
  'Real Estate & Acquisitions',
  'Financial Services & Insurance',
  'Manufacturing & Industrial',
  'Retail & E-commerce',
  'Professional Services / Agency',
  'Other Multi-Industry',
];

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: '',
    industry: INDUSTRIES[0],
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(form);
      navigate('/profiles');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card" style={{ width: 420 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>
          <div className="brand-icon">⚡</div>
          <span className="brand-text">Ledger CRM</span>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: 0, marginBottom: 24, textAlign: 'center' }}>
          Set up your organization's multi-industry workspace
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Company / Organization Name</label>
            <input
              value={form.companyName}
              onChange={e => update('companyName', e.target.value)}
              placeholder="e.g. Apex Global Logistics"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Primary Industry</label>
            <select
              value={form.industry}
              onChange={e => update('industry', e.target.value)}
            >
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Your Full Name</label>
            <input
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g. Alex Morgan"
              required
            />
          </div>

          <div className="field">
            <label>Work Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="alex@apexlogistics.com"
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: '10px 14px' }}
            disabled={loading}
          >
            {loading ? 'Setting up workspace…' : 'Create Company Workspace'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 22, textAlign: 'center' }}>
          Already registered? <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
