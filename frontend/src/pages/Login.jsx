import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/profiles');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>
          <div className="brand-icon">⚡</div>
          <span className="brand-text">Ledger CRM</span>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginTop: 0, marginBottom: 24, textAlign: 'center' }}>
          Sign in to your multi-campaign workspace
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Work Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="alex@company.com"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: '10px 14px' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In to Workspace'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 22, textAlign: 'center' }}>
          New company? <Link to="/signup" style={{ fontWeight: 600 }}>Create workspace</Link>
        </p>
      </div>
    </div>
  );
}
