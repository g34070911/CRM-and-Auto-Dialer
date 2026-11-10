const BASE = '/api';

function getToken() {
  return localStorage.getItem('crm_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401) {
    // If unauthorized, clear storage so app redirects to login
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_company');
    window.dispatchEvent(new Event('auth-unauthorized'));
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Auth & Team
  signup: (payload) => request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request('/auth/me'),
  getTeam: () => request('/auth/team'),

  // Profiles
  listProfiles: () => request('/profiles'),
  createProfile: (payload) => request('/profiles', { method: 'POST', body: JSON.stringify(payload) }),
  getProfile: (id) => request(`/profiles/${id}`),
  updateProfile: (id, payload) => request(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteProfile: (id) => request(`/profiles/${id}`, { method: 'DELETE' }),

  // Dynamic Fields
  listFields: (profileId) => request(`/profiles/${profileId}/fields`),
  createField: (profileId, payload) => request(`/profiles/${profileId}/fields`, { method: 'POST', body: JSON.stringify(payload) }),
  updateField: (profileId, fieldId, payload) => request(`/profiles/${profileId}/fields/${fieldId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteField: (profileId, fieldId) => request(`/profiles/${profileId}/fields/${fieldId}`, { method: 'DELETE' }),
  reorderFields: (profileId, orderedIds) => request(`/profiles/${profileId}/fields/reorder`, { method: 'PUT', body: JSON.stringify({ orderedIds }) }),

  // Records (Leads)
  listRecords: (profileId, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/profiles/${profileId}/records${suffix}`);
  },
  getRecordStats: (profileId, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/profiles/${profileId}/records/stats${suffix}`);
  },
  getRecord: (profileId, recordId) => request(`/profiles/${profileId}/records/${recordId}`),
  createRecord: (profileId, payload) => request(`/profiles/${profileId}/records`, { method: 'POST', body: JSON.stringify(payload) }),
  updateRecord: (profileId, recordId, payload) => request(`/profiles/${profileId}/records/${recordId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  cloneRecord: (profileId, recordId) => request(`/profiles/${profileId}/records/${recordId}/clone`, { method: 'POST' }),
  deleteRecord: (profileId, recordId) => request(`/profiles/${profileId}/records/${recordId}`, { method: 'DELETE' }),
  bulkRecords: (profileId, payload) => request(`/profiles/${profileId}/records/bulk`, { method: 'POST', body: JSON.stringify(payload) }),
  listDialerProfiles: (profileId) => request(`/profiles/${profileId}/dialer/profiles`),
  createDialerProfile: (profileId, payload) => request(`/profiles/${profileId}/dialer/profiles`, { method: 'POST', body: JSON.stringify(payload) }),
  updateDialerProfile: (profileId, dialerProfileId, payload) => request(`/profiles/${profileId}/dialer/profiles/${dialerProfileId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  createCallSession: (profileId, payload) => request(`/profiles/${profileId}/dialer/sessions`, { method: 'POST', body: JSON.stringify(payload) }),
  endCallSession: (profileId, sessionId, payload) => request(`/profiles/${profileId}/dialer/sessions/${sessionId}/end`, { method: 'POST', body: JSON.stringify(payload) }),
  listCallActivities: (profileId, recordId) => request(`/profiles/${profileId}/dialer/records/${recordId}/activities`),
  createAgentPairing: (profileId, payload) => request(`/profiles/${profileId}/dialer/pairings`, { method: 'POST', body: JSON.stringify(payload) }),
  listAgentPairings: (profileId) => request(`/profiles/${profileId}/dialer/pairings`),
  revokeAgentPairing: (profileId, pairingId) => request(`/profiles/${profileId}/dialer/pairings/${pairingId}/revoke`, { method: 'POST' }),
  listDoNotCall: (profileId) => request(`/profiles/${profileId}/dialer/do-not-call`),
  addDoNotCall: (profileId, payload) => request(`/profiles/${profileId}/dialer/do-not-call`, { method: 'POST', body: JSON.stringify(payload) }),
  removeDoNotCall: (profileId, numberId) => request(`/profiles/${profileId}/dialer/do-not-call/${numberId}`, { method: 'DELETE' }),
  reorderRecords: (profileId, orderedIds) => request(`/profiles/${profileId}/records/reorder`, { method: 'PUT', body: JSON.stringify({ orderedIds }) }),

  // Import
  importPreview: (profileId, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/profiles/${profileId}/import/preview`, { method: 'POST', body: form });
  },
  importFile: (profileId, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/profiles/${profileId}/import`, { method: 'POST', body: form });
  },

  // Export
  exportData: (profileId, params = {}) => {
    const token = getToken();
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const url = `${BASE}/profiles/${profileId}/export${suffix}`;

    // Trigger browser download with auth header via fetch blob
    return fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = `leads_export.${params.format === 'xlsx' ? 'xlsx' : 'csv'}`;
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    });
  },

  // Saved Filters (Presets)
  listSavedFilters: (profileId) => request(`/profiles/${profileId}/saved-filters`),
  createSavedFilter: (profileId, payload) => request(`/profiles/${profileId}/saved-filters`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteSavedFilter: (profileId, filterId) => request(`/profiles/${profileId}/saved-filters/${filterId}`, { method: 'DELETE' }),
};

export function setToken(token) {
  if (token) localStorage.setItem('crm_token', token);
  else localStorage.removeItem('crm_token');
}

export function getStoredToken() {
  return getToken();
}
