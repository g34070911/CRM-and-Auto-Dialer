import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';

export default function Layout() {
  const { user, company, logout } = useAuth();
  const navigate = useNavigate();
  const { profileId } = useParams();
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    api.listProfiles()
      .then(setProfiles)
      .catch(() => {});
  }, [profileId]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = (user?.name || '?')
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => navigate('/profiles')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon">⚡</div>
          <span className="brand-text">Ledger CRM</span>
        </div>

        <div className="company-badge">
          <div className="company-badge-icon">🏢</div>
          <div className="company-badge-info">
            <div className="company-badge-name">{company?.name || 'My Workspace'}</div>
            <div className="company-badge-ind">{company?.industry || 'Enterprise'}</div>
          </div>
        </div>

        <div className="nav-section-label">Campaign Profiles</div>
        <div className="sidebar-profiles-list">
          {profiles.map(p => (
            <NavLink
              key={p.id}
              to={`/profiles/${p.id}`}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <div className="nav-item-content">
                <span className="nav-dot" />
                <span className="nav-title" title={p.name}>{p.name}</span>
              </div>
              <span className="count">{p.record_count}</span>
            </NavLink>
          ))}
        </div>

        <div
          className="nav-item nav-item-add"
          onClick={() => navigate('/profiles')}
        >
          <span>+ Manage Campaigns</span>
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{user?.name}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button className="btn-signout" onClick={handleLogout} title="Sign Out">
            Sign out ↗
          </button>
        </div>
      </aside>

      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
