import React from 'react';

const STAGES = [
  { key: 'New', label: 'New Leads', color: 'var(--blue)' },
  { key: 'Contacted', label: 'Contacted', color: 'var(--brass)' },
  { key: 'Qualified', label: 'Qualified', color: 'var(--forest)' },
  { key: 'Converted', label: 'Converted / Won', color: '#166534' },
  { key: 'Lost', label: 'Lost / Disqualified', color: 'var(--red)' },
];

export default function KanbanBoard({ fields, records, onSelectRecord, onEditStatus }) {
  // Group records by status
  const grouped = {
    New: [],
    Contacted: [],
    Qualified: [],
    Converted: [],
    Lost: [],
  };

  records.forEach(r => {
    if (grouped[r.status]) {
      grouped[r.status].push(r);
    } else {
      grouped.New.push(r);
    }
  });

  const primaryField = fields[0]?.key;
  const secondaryField = fields[1]?.key;
  const thirdField = fields[2]?.key;

  return (
    <div className="kanban-container">
      {STAGES.map(stage => {
        const stageRecords = grouped[stage.key] || [];

        return (
          <div key={stage.key} className="kanban-column">
            <div className="kanban-column-header">
              <div className="kanban-column-title">
                <span className="kanban-stage-indicator" style={{ background: stage.color }} />
                <span>{stage.label}</span>
              </div>
              <span className="kanban-column-count">{stageRecords.length}</span>
            </div>

            <div className="kanban-cards-list">
              {stageRecords.length === 0 ? (
                <div className="kanban-empty">No leads in {stage.label}</div>
              ) : (
                stageRecords.map(r => {
                  const title = (primaryField && r.data?.[primaryField]) || `Lead #${r.id.slice(0, 6)}`;
                  const subtitle = secondaryField && r.data?.[secondaryField];
                  const thirdVal = thirdField && r.data?.[thirdField];

                  return (
                    <div
                      key={r.id}
                      className="kanban-card"
                      onClick={() => onSelectRecord(r.id)}
                    >
                      <div className="kanban-card-top">
                        <div className="kanban-card-title">{title}</div>
                        <select
                          className={`badge badge-${r.status}`}
                          style={{ border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}
                          value={r.status}
                          onClick={e => e.stopPropagation()}
                          onChange={e => onEditStatus(r.id, e.target.value)}
                        >
                          {STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                        </select>
                      </div>

                      {subtitle && (
                        <div className="kanban-card-sub">{subtitle}</div>
                      )}

                      {thirdVal && (
                        <div className="kanban-card-detail">
                          <span style={{ color: 'var(--ink-soft)' }}>{fields[2]?.label}:</span> {thirdVal}
                        </div>
                      )}

                      {/* Display other important attributes */}
                      <div className="kanban-card-attributes">
                        {fields.slice(3, 5).map(f => {
                          const val = r.data?.[f.key];
                          if (!val) return null;
                          return (
                            <div key={f.key} className="kanban-attr-pill" title={`${f.label}: ${val}`}>
                              <strong>{f.label}:</strong> {val}
                            </div>
                          );
                        })}
                      </div>

                      <div className="kanban-card-footer">
                        <div className="kanban-card-tags">
                          {(r.tags || []).slice(0, 3).map(t => (
                            <span key={t} className="tag-chip">{t}</span>
                          ))}
                        </div>
                        {r.assigned_user_name && (
                          <div className="kanban-assignee-avatar" title={`Assigned to ${r.assigned_user_name}`}>
                            {r.assigned_user_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
