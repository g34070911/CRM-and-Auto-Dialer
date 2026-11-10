import { useState } from 'react';

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];

export default function DataTable({
  fields,
  records,
  selected,
  sortBy,
  sortDir,
  page = 1,
  pageSize = 50,
  onSort,
  onToggleSelect,
  onToggleSelectAll,
  onEditCell,
  onEditStatus,
  onSelectRecord,
  onDeleteRecord,
  onCloneRecord,
  onReorder,
  reorderEnabled = false,
}) {
  const [editingCell, setEditingCell] = useState(null); // `${recordId}:${key}`
  const [draftValue, setDraftValue] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  function startEdit(recordId, key, currentValue) {
    setEditingCell(`${recordId}:${key}`);
    setDraftValue(currentValue ?? '');
  }

  function commitEdit(recordId, key) {
    onEditCell(recordId, key, draftValue);
    setEditingCell(null);
  }

  const allSelected = records.length > 0 && records.every(r => selected.has(r.id));

  function handleSortClick(key) {
    if (sortBy === key) {
      onSort(key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(key, 'asc');
    }
  }

  function handleDrop(targetId) {
    if (!draggedId || draggedId === targetId || !onReorder) return;
    const from = records.findIndex(r => r.id === draggedId);
    const to = records.findIndex(r => r.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...records];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next.map(r => r.id));
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 44, textAlign: 'center', position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-subtle)' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={e => onToggleSelectAll(e.target.checked)}
              />
            </th>
            <th
              className="row-order-header"
              style={{ width: 44, textAlign: 'center', color: 'var(--ink-muted)' }}
              onClick={() => onSort('row_order', 'asc')}
              title="Use custom row order"
            >
              {reorderEnabled ? '☷' : '#'}
            </th>

            {/* Dynamic Columns in Exact Sheet Order */}
            {fields.map((f, idx) => {
              const sortKey = `data.${f.key}`;
              const isSorted = sortBy === sortKey || sortBy === f.key;
              return (
                <th
                  key={f.key}
                  onClick={() => handleSortClick(sortKey)}
                  className="sortable-th"
                  style={{ minWidth: 150 }}
                  title={`Column ${idx + 1}: ${f.label} (${f.type})`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span className="th-label">{f.label}</span>
                    <span className="sort-icon">{isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>
              );
            })}

            <th style={{ width: 120 }} onClick={() => handleSortClick('status')} className="sortable-th">
              Status {sortBy === 'status' && (sortDir === 'asc' ? '▲' : '▼')}
            </th>
            <th style={{ width: 110, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, rIdx) => {
            const rowNumber = (page - 1) * pageSize + rIdx + 1;
            const isSelected = selected.has(r.id);

            return (
              <tr key={r.id} className={isSelected ? 'selected' : ''}>
                {/* Sticky checkbox column */}
                <td style={{ textAlign: 'center', position: 'sticky', left: 0, zIndex: 1, background: isSelected ? '#f5f3ff' : 'var(--bg-card)' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(r.id)}
                  />
                </td>

                {/* Row Index */}
                <td
                  className={`row-index-cell ${dragOverId === r.id ? 'drag-over' : ''}`}
                  draggable={reorderEnabled}
                  onDragStart={e => {
                    if (!reorderEnabled) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', r.id);
                    setDraggedId(r.id);
                  }}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                  onDragOver={e => { if (reorderEnabled) { e.preventDefault(); setDragOverId(r.id); } }}
                  onDrop={e => { e.preventDefault(); handleDrop(r.id); }}
                  style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-muted)' }}
                  title={reorderEnabled ? 'Drag to reorder row' : 'Sort by Custom Order to reorder rows'}
                >
                  {reorderEnabled ? <span className="row-drag-handle">☷</span> : rowNumber}
                </td>

                {/* Dynamic Columns exactly matching sheet positions */}
                {fields.map(f => {
                  const cellKey = `${r.id}:${f.key}`;
                  const value = r.data?.[f.key] !== undefined && r.data?.[f.key] !== null ? String(r.data[f.key]) : '';
                  const isEditing = editingCell === cellKey;
                  const isBlank = value.trim() === '';

                  return (
                    <td key={f.key} title={value} className={isBlank ? 'cell-blank' : ''}>
                      {isEditing ? (
                        <input
                          className="cell-input"
                          autoFocus
                          value={draftValue}
                          onChange={e => setDraftValue(e.target.value)}
                          onBlur={() => commitEdit(r.id, f.key)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(r.id, f.key);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                        />
                      ) : (
                        <div
                          className="cell-editable"
                          onClick={() => startEdit(r.id, f.key, value)}
                          title={value ? `Click to edit: "${value}"` : 'Empty (Click to add value)'}
                        >
                          {!isBlank ? (
                            f.type === 'url' ? (
                              <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                {value} ↗
                              </a>
                            ) : f.type === 'email' ? (
                              <a href={`mailto:${value}`} onClick={e => e.stopPropagation()}>{value}</a>
                            ) : f.type === 'phone' ? (
                              <a href={`tel:${value}`} onClick={e => e.stopPropagation()}>{value}</a>
                            ) : (
                              <span className="cell-text-value">{value}</span>
                            )
                          ) : (
                            <span className="cell-empty-indicator">&nbsp;</span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* Status Column */}
                <td>
                  <select
                    className={`badge badge-${r.status}`}
                    style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
                    value={r.status}
                    onChange={e => onEditStatus(r.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>

                {/* Actions Column */}
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn-action-icon"
                      onClick={() => onSelectRecord(r.id)}
                      title="Inspect & Edit Lead"
                    >
                      👁️
                    </button>
                    <button
                      type="button"
                      className="btn-action-icon"
                      onClick={() => onCloneRecord(r.id)}
                      title="Duplicate Record"
                    >
                      📄
                    </button>
                    <button
                      type="button"
                      className="btn-action-icon btn-action-danger"
                      onClick={() => onDeleteRecord(r.id)}
                      title="Delete Record"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
