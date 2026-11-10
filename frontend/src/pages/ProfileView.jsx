import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import DataTable from '../components/DataTable.jsx';
import KanbanBoard from '../components/KanbanBoard.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import ImportModal from '../components/ImportModal.jsx';
import CreateLeadModal from '../components/CreateLeadModal.jsx';
import LeadDrawer from '../components/LeadDrawer.jsx';
import ColumnManagerModal from '../components/ColumnManagerModal.jsx';
import PhoneColumnPicker from '../components/PhoneColumnPicker.jsx';
import ExtensionDialerPanel from '../components/ExtensionDialerPanel.jsx';

export default function ProfileView() {
  const { profileId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [fields, setFields] = useState([]);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0, breakdown: {} });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('row_order');
  const [sortDir, setSortDir] = useState('asc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'kanban'
  const [phoneFieldKey, setPhoneFieldKey] = useState(() => localStorage.getItem(`dialer_phone_field:${profileId}`) || '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(new Set());

  // Modals & Drawers state
  const [showImport, setShowImport] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Debounce search input (300ms)
  const searchTimerRef = useRef(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Abort controller ref to cancel in-flight requests when filters change
  const abortRef = useRef(null);

  const loadStatic = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api.getProfile(profileId), api.listFields(profileId)]);
      setProfile(p);
      setFields(f);
    } catch (err) {
      setError(err.message);
    }
  }, [profileId]);

  const loadRecords = useCallback(async () => {
    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        pageSize: viewMode === 'kanban' ? 200 : pageSize,
        sortBy,
        sortDir,
        search: debouncedSearch,
        status: filters.status,
        assigned_to: filters.assigned_to,
        tags: filters.tags,
        source: filters.source,
        date_from: filters.date_from,
        date_to: filters.date_to,
        filters: filters.filters && filters.filters.length ? JSON.stringify(filters.filters) : undefined,
      };

      const [recordRes, statsRes] = await Promise.all([
        api.listRecords(profileId, params),
        api.getRecordStats(profileId, params),
      ]);

      // Only apply results if this request wasn't aborted
      if (!controller.signal.aborted) {
        setRecords(recordRes.records);
        setTotal(recordRes.total);
        setStats(statsRes);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        setError(err.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [profileId, page, pageSize, sortBy, sortDir, debouncedSearch, filters, viewMode]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    loadStatic();
  }, [profileId, loadStatic]);

  useEffect(() => {
    setPhoneFieldKey(localStorage.getItem(`dialer_phone_field:${profileId}`) || '');
  }, [profileId]);

  function handlePhoneFieldChange(key) {
    setPhoneFieldKey(key || '');
    if (key) localStorage.setItem(`dialer_phone_field:${profileId}`, key);
    else localStorage.removeItem(`dialer_phone_field:${profileId}`);
  }

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  function toggleSelect(id) {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(checked) {
    setSelected(checked ? new Set(records.map(r => r.id)) : new Set());
  }

  function handleSort(key, dir) {
    setSortBy(key);
    setSortDir(dir);
  }

  async function handleEditCell(recordId, key, value) {
    setRecords(rs => rs.map(r => r.id === recordId ? { ...r, data: { ...r.data, [key]: value } } : r));
    try {
      await api.updateRecord(profileId, recordId, { data: { [key]: value } });
    } catch (err) {
      setError(err.message);
      loadRecords();
    }
  }

  async function handleEditStatus(recordId, newStatus) {
    setRecords(rs => rs.map(r => r.id === recordId ? { ...r, status: newStatus } : r));
    try {
      await api.updateRecord(profileId, recordId, { status: newStatus });
      loadRecords();
    } catch (err) {
      setError(err.message);
      loadRecords();
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} selected record(s)?`)) return;
    try {
      await api.bulkRecords(profileId, { ids: [...selected], action: 'delete' });
      setSelected(new Set());
      loadRecords();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBulkStatus(status) {
    if (selected.size === 0 || !status) return;
    try {
      await api.bulkRecords(profileId, { ids: [...selected], action: 'set_status', value: status });
      setSelected(new Set());
      loadRecords();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSingleRecord(recordId) {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await api.deleteRecord(profileId, recordId);
      loadRecords();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCloneRecord(recordId) {
    try {
      await api.cloneRecord(profileId, recordId);
      loadRecords();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReorderRows(orderedIds) {
    const previousRecords = records;
    const positions = new Map(orderedIds.map((id, index) => [id, index]));
    setRecords(rs => [...rs].sort((a, b) => positions.get(a.id) - positions.get(b.id)));
    try {
      await api.reorderRecords(profileId, orderedIds);
    } catch (err) {
      setRecords(previousRecords);
      setError(err.message);
    }
  }

  async function handleExport(format) {
    setExporting(true);
    try {
      await api.exportData(profileId, {
        format,
        search: debouncedSearch,
        status: filters.status,
        tags: filters.tags,
        source: filters.source,
        date_from: filters.date_from,
        date_to: filters.date_to,
        filters: filters.filters && filters.filters.length ? JSON.stringify(filters.filters) : undefined,
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <>
      {/* Top Header Bar */}
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="page-title">{profile?.name || 'Loading Campaign...'}</div>
            <span className="profile-campaign-badge">Active Campaign</span>
          </div>
          <div className="page-sub">
            {profile?.description || 'Campaign Profile'} · {total} leads total
          </div>
        </div>

        <div className="topbar-actions">
          <button className="btn" onClick={() => setShowColumnManager(true)} title="Manage custom fields and order">
            ⚙️ Columns ({fields.length})
          </button>

          <div className="export-dropdown-wrap">
            <button
              className="btn"
              disabled={exporting}
              onClick={() => handleExport('csv')}
              title="Export filtered records to CSV"
            >
              {exporting ? 'Exporting…' : '⤓ Export CSV'}
            </button>
            <button
              className="btn"
              style={{ marginLeft: -2 }}
              disabled={exporting}
              onClick={() => handleExport('xlsx')}
              title="Export filtered records to Excel"
            >
              Excel
            </button>
          </div>

          <button className="btn" onClick={() => setShowImport(true)}>
            ⇪ Import Spreadsheet
          </button>

          <button className="btn btn-primary" onClick={() => setShowCreateLead(true)}>
            + Add Lead
          </button>
        </div>
      </div>

      <div className="content">
        {error && <div className="error-banner">{error}</div>}

        {/* Pipeline Summary Metrics Bar */}
        <div className="pipeline-metrics-bar">
          <div className="metric-pill" onClick={() => setFilters(f => ({ ...f, status: '' }))} style={{ cursor: 'pointer' }}>
            <div className="metric-num">{total}</div>
            <div className="metric-lbl">Total Leads</div>
          </div>
          <div className="metric-pill metric-New" onClick={() => setFilters(f => ({ ...f, status: 'New' }))} style={{ cursor: 'pointer' }}>
            <div className="metric-num">{stats.breakdown?.New || 0}</div>
            <div className="metric-lbl">New</div>
          </div>
          <div className="metric-pill metric-Contacted" onClick={() => setFilters(f => ({ ...f, status: 'Contacted' }))} style={{ cursor: 'pointer' }}>
            <div className="metric-num">{stats.breakdown?.Contacted || 0}</div>
            <div className="metric-lbl">Contacted</div>
          </div>
          <div className="metric-pill metric-Qualified" onClick={() => setFilters(f => ({ ...f, status: 'Qualified' }))} style={{ cursor: 'pointer' }}>
            <div className="metric-num">{stats.breakdown?.Qualified || 0}</div>
            <div className="metric-lbl">Qualified</div>
          </div>
          <div className="metric-pill metric-Converted" onClick={() => setFilters(f => ({ ...f, status: 'Converted' }))} style={{ cursor: 'pointer' }}>
            <div className="metric-num">{stats.breakdown?.Converted || 0}</div>
            <div className="metric-lbl">Converted</div>
          </div>
          <div className="metric-pill metric-Lost" onClick={() => setFilters(f => ({ ...f, status: 'Lost' }))} style={{ cursor: 'pointer' }}>
            <div className="metric-num">{stats.breakdown?.Lost || 0}</div>
            <div className="metric-lbl">Lost</div>
          </div>
        </div>

        {/* Search & Bulk Toolbar */}
        <div className="toolbar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Search across all columns, phones, emails, tags..."
              value={search}
              onChange={e => { setPage(1); setSearch(e.target.value); }}
            />
            {search && (
              <button className="search-clear-btn" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* View Mode Toggle (Table / Kanban) */}
          <div className="view-mode-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              📋 Table
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban Pipeline View"
            >
              📊 Kanban
            </button>
          </div>

          {/* Bulk Operations Bar */}
          {selected.size > 0 && (
            <div className="bulk-actions-pill">
              <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
              <select
                className="select-input select-sm"
                onChange={e => handleBulkStatus(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Change Status...</option>
                {['New', 'Contacted', 'Qualified', 'Converted', 'Lost'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
                Delete Selected
              </button>
            </div>
          )}
        </div>

        {/* Advanced Filter Panel */}
        <FilterPanel
          profileId={profileId}
          fields={fields}
          value={filters}
          onChange={f => { setPage(1); setFilters(f); }}
        />

        <PhoneColumnPicker fields={fields} records={records} value={phoneFieldKey} onChange={handlePhoneFieldChange} />
        <ExtensionDialerPanel profileId={profileId} records={records} phoneFieldKey={phoneFieldKey} />

        {/* Records Display (Table vs Kanban) */}
        {loading && records.length === 0 ? (
          <div className="loading-state">
            <div className="spinner" />
            <div style={{ marginTop: 12, color: 'var(--ink-soft)' }}>Loading campaign records...</div>
          </div>
        ) : records.length === 0 && !loading ? (
          <div className="empty-state">
            <div style={{ fontSize: 44, marginBottom: 10 }}>📥</div>
            <h3>No Leads in this View</h3>
            <p>
              {search || Object.keys(filters).length > 0
                ? 'Try adjusting your search criteria or clearing applied filters.'
                : 'Import a spreadsheet (.csv / .xlsx) from Google Sheets or Excel, or add a lead manually.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => setShowImport(true)}>
                ⇪ Import Spreadsheet
              </button>
              <button className="btn" onClick={() => setShowCreateLead(true)}>
                + Add Lead Manually
              </button>
            </div>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            fields={fields}
            records={records}
            onSelectRecord={id => setSelectedRecordId(id)}
            onEditStatus={handleEditStatus}
          />
        ) : (
          <>
            {/* Show subtle loading indicator during re-fetch while data is on screen */}
            {loading && records.length > 0 && (
              <div style={{
                padding: '6px 14px',
                background: 'linear-gradient(90deg, var(--primary-light), transparent)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--primary)',
                fontWeight: 600,
                marginBottom: 8,
                animation: 'pulse 1s ease-in-out infinite',
              }}>
                ⏳ Updating results…
              </div>
            )}
            <DataTable
              fields={fields}
              records={records}
              selected={selected}
              sortBy={sortBy}
              sortDir={sortDir}
              page={page}
              pageSize={pageSize}
              onSort={handleSort}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onEditCell={handleEditCell}
              onEditStatus={handleEditStatus}
              onSelectRecord={id => setSelectedRecordId(id)}
              onDeleteRecord={handleDeleteSingleRecord}
              onCloneRecord={handleCloneRecord}
              onReorder={handleReorderRows}
              reorderEnabled={sortBy === 'row_order'}
            />

            <div className="pagination">
              <span>
                Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</strong> of <strong>{total}</strong> leads
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="select-input select-sm"
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  ← Prev
                </button>
                <span style={{ margin: '0 4px' }}>Page {page} of {totalPages}</span>
                <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals & Drawers */}
      {showImport && (
        <ImportModal
          profileId={profileId}
          onClose={() => setShowImport(false)}
          onImported={() => { loadStatic(); loadRecords(); }}
        />
      )}

      {showCreateLead && (
        <CreateLeadModal
          profileId={profileId}
          fields={fields}
          onClose={() => setShowCreateLead(false)}
          onCreated={() => { loadRecords(); }}
        />
      )}

      {showColumnManager && (
        <ColumnManagerModal
          profileId={profileId}
          fields={fields}
          onClose={() => setShowColumnManager(false)}
          onUpdated={() => { loadStatic(); loadRecords(); }}
        />
      )}

      {selectedRecordId && (
        <LeadDrawer
          profileId={profileId}
          recordId={selectedRecordId}
          fields={fields}
          onClose={() => setSelectedRecordId(null)}
          onUpdated={() => { loadRecords(); }}
          onDeleted={() => { setSelectedRecordId(null); loadRecords(); }}
        />
      )}
    </>
  );
}
