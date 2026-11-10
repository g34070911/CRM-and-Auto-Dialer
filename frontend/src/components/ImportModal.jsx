import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function ImportModal({ profileId, onClose, onImported }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function pickFile(f) {
    if (!f) return;
    const okExt = /\.(csv|xlsx|xls|tsv|txt)$/i.test(f.name);
    if (!okExt) {
      setError('Please choose a .csv, .xlsx, or .xls file');
      return;
    }
    setError('');
    setFile(f);
    setResult(null);

    // Run preview analysis
    setAnalyzing(true);
    try {
      const prev = await api.importPreview(profileId, f);
      setPreview(prev);
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const res = await api.importFile(profileId, file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">⇪ Universal Spreadsheet Import</div>
            <div className="modal-subtitle">Import CSV, XLSX or XLS files from Google Sheets or Microsoft Excel</div>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {result ? (
          <div className="import-success-box">
            <div className="import-success-icon">✅</div>
            <div className="import-success-title">Import Successfully Completed!</div>
            <div className="import-success-stats">
              <div className="stat-card">
                <div className="stat-num">{result.rowsImported}</div>
                <div className="stat-lbl">Rows Ingested</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{result.fieldsCreated}</div>
                <div className="stat-lbl">Columns Preserved</div>
              </div>
            </div>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 16 }}>
              The data has been structured in your database in the exact order of your spreadsheet.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 18, minWidth: 120 }} onClick={onClose}>
              View Leads
            </button>
          </div>
        ) : preview ? (
          <div>
            <div className="import-preview-header">
              <div>
                <strong>{preview.filename}</strong>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  Detected <strong>{preview.totalRows} data rows</strong> and <strong>{preview.fields.length} columns</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { setFile(null); setPreview(null); }}
              >
                Change File
              </button>
            </div>

            <div className="form-section-title" style={{ marginTop: 14 }}>
              Preserved Field Structure & Type Inferences
            </div>

            <div className="preview-fields-chips">
              {preview.fields.map((f, i) => (
                <div key={i} className="preview-field-pill">
                  <span className="pill-index">{i + 1}</span>
                  <span className="pill-name">{f.header}</span>
                  <span className="field-type-tag">{f.inferredType}</span>
                </div>
              ))}
            </div>

            {preview.previewRows && preview.previewRows.length > 0 && (
              <>
                <div className="form-section-title" style={{ marginTop: 14 }}>
                  First {preview.previewRows.length} Rows Preview
                </div>
                <div className="table-wrap" style={{ maxHeight: 200, marginBottom: 14 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {preview.fields.map((f, i) => (
                          <th key={i}>{f.header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {preview.fields.map((f, cIdx) => (
                            <td key={cIdx}>{row[f.header] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Ingesting Spreadsheet...' : `✓ Import All ${preview.totalRows} Leads`}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 16 }}>
              Drop your spreadsheet below. The header row will be mapped into this profile in its exact left-to-right sequence, and repeat imports with matching headers will align automatically.
            </p>

            <div
              className={`dropzone${dragActive ? ' active' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => {
                e.preventDefault();
                setDragActive(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
            >
              {analyzing ? (
                <div>
                  <div className="spinner" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600 }}>Analyzing spreadsheet structure…</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>
                    Drop Google Sheets CSV or Excel (.xlsx, .xls) here
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: 'var(--ink-soft)' }}>
                    Supports files up to 25,000 rows
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={e => pickFile(e.target.files?.[0])}
              />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
