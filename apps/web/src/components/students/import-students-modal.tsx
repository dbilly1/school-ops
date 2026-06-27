'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { staffApi, type ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { downloadCsv } from '@/lib/csv';

// ── Column model ────────────────────────────────────────────────────────────
// One entry per importable field. `header` is what the template prints; `aliases`
// (lower-cased) let us accept the variations schools actually type.

type ColKey =
  | 'firstName' | 'lastName' | 'gender' | 'dateOfBirth' | 'className'
  | 'categoryName' | 'address' | 'guardianName' | 'guardianPhone' | 'guardianRelationship';

const COLUMNS: { key: ColKey; header: string; required?: boolean; aliases: string[] }[] = [
  { key: 'firstName',            header: 'First Name',            required: true, aliases: ['first name', 'firstname', 'first', 'given name'] },
  { key: 'lastName',             header: 'Last Name',             required: true, aliases: ['last name', 'lastname', 'surname', 'last', 'family name'] },
  { key: 'gender',               header: 'Gender',                aliases: ['gender', 'sex'] },
  { key: 'dateOfBirth',          header: 'Date of Birth',         aliases: ['date of birth', 'dob', 'birth date', 'birthdate', 'd.o.b'] },
  { key: 'className',            header: 'Class',                 aliases: ['class', 'class name', 'classname', 'grade'] },
  { key: 'categoryName',         header: 'Fee Category',          aliases: ['fee category', 'category', 'feecategory', 'student category'] },
  { key: 'address',              header: 'Address',               aliases: ['address', 'home address', 'residence'] },
  { key: 'guardianName',         header: 'Guardian Name',         aliases: ['guardian name', 'guardian', 'parent name', 'parent', 'parent/guardian'] },
  { key: 'guardianPhone',        header: 'Guardian Phone',        aliases: ['guardian phone', 'phone', 'parent phone', 'contact', 'telephone', 'mobile', 'phone number'] },
  { key: 'guardianRelationship', header: 'Guardian Relationship', aliases: ['guardian relationship', 'relationship', 'relation'] },
];

const EXAMPLE_ROW = ['Ama', 'Mensah', 'Female', '2015-05-12', 'Basic 1', 'Day', '12 Liberation Rd, Accra', 'Kofi Mensah', '+233200000000', 'Father'];

type ImportRow = Partial<Record<ColKey, string>>;

type RowResult = {
  rowIndex: number;
  status: 'ok' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  resolved: {
    firstName: string; lastName: string; gender: string | null; dateOfBirth: string | null;
    address: string | null; classId: string | null; className: string | null;
    studentCategoryId: string | null; categoryName: string | null;
    guardian: { name: string; relationship: string; phone: string | null } | null;
  };
};

type ValidateResponse = {
  rows: RowResult[];
  summary: { total: number; ok: number; warning: number; error: number };
};

type ImportResponse = {
  created: { rowIndex: number; studentId: string; firstName: string; lastName: string; className: string | null; tempPassword: string }[];
  skipped: { rowIndex: number; reason: string }[];
  summary: { created: number; skipped: number };
};

// ── Header matching + cell coercion ─────────────────────────────────────────

function normaliseHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function matchColumn(rawHeader: string): ColKey | null {
  const h = normaliseHeader(rawHeader);
  for (const col of COLUMNS) {
    if (h === col.header.toLowerCase() || col.aliases.includes(h)) return col.key;
  }
  return null;
}

/** Excel date cells arrive as JS Dates (cellDates); format to YYYY-MM-DD without tz drift. */
function cellToString(val: unknown): string {
  if (val == null) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).trim();
}

async function parseFile(file: File): Promise<{ rows: ImportRow[]; unmatched: string[]; missingRequired: string[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], unmatched: [], missingRequired: COLUMNS.filter(c => c.required).map(c => c.header) };

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });

  // Figure out which headers we recognised (from the first row's keys).
  const headerKeys = json.length ? Object.keys(json[0]) : [];
  const matchedKeys = new Set<ColKey>();
  const unmatched: string[] = [];
  for (const hk of headerKeys) {
    const col = matchColumn(hk);
    if (col) matchedKeys.add(col);
    else if (hk.trim()) unmatched.push(hk.trim());
  }
  const missingRequired = COLUMNS.filter(c => c.required && !matchedKeys.has(c.key)).map(c => c.header);

  const rows: ImportRow[] = json
    .map(obj => {
      const out: ImportRow = {};
      for (const [rawKey, val] of Object.entries(obj)) {
        const key = matchColumn(rawKey);
        if (key) out[key] = cellToString(val);
      }
      return out;
    })
    // Drop blank rows (trailing empty lines are common in exported sheets).
    .filter(r => Object.values(r).some(v => v && v.trim()));

  return { rows, unmatched, missingRequired };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ImportStudentsModal({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  // Original parsed rows (sent verbatim on import) + the server's per-row analysis.
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [analysis, setAnalysis] = useState<ValidateResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResponse | null>(null);

  function reset() {
    setStep('upload'); setBusy(false); setError(null); setFileName('');
    setRows([]); setAnalysis(null); setSelected(new Set()); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose() { reset(); onClose(); }

  function downloadTemplate() {
    downloadCsv('student-import-template', COLUMNS.map(c => c.header + (c.required ? '*' : '')), [EXAMPLE_ROW]);
  }

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const { rows: parsed, unmatched, missingRequired } = await parseFile(file);
      if (parsed.length === 0) {
        setError('No rows found in that file. Make sure the first row has column headers and there is at least one student below it.');
        return;
      }
      if (missingRequired.length) {
        setError(`The file is missing required column${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.join(', ')}. Download the template to see the expected columns.`);
        return;
      }
      const res = await staffApi.post<ValidateResponse>('/school/students/import/validate', { rows: parsed });
      setRows(parsed);
      setAnalysis(res);
      setFileName(file.name);
      // Pre-select every importable (non-error) row, including duplicates — the
      // user can uncheck the ones they don't want.
      setSelected(new Set(res.rows.filter(r => r.status !== 'error').map(r => r.rowIndex)));
      if (unmatched.length) {
        setError(`Ignored unrecognised column${unmatched.length > 1 ? 's' : ''}: ${unmatched.join(', ')}.`);
      }
      setStep('preview');
    } catch (err) {
      setError((err as ApiError).message ?? 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!analysis) return;
    const chosen = analysis.rows.filter(r => selected.has(r.rowIndex) && r.status !== 'error');
    if (chosen.length === 0) { setError('Select at least one student to import.'); return; }
    setError(null);
    setBusy(true);
    try {
      const payload = chosen.map(r => rows[r.rowIndex]);
      const res = await staffApi.post<ImportResponse>('/school/students/import', { rows: payload });
      setResult(res);
      setStep('result');
      onImported();
    } catch (err) {
      setError((err as ApiError).message ?? 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  function downloadCredentials() {
    if (!result) return;
    downloadCsv(
      'student-login-details',
      ['Student ID', 'First Name', 'Last Name', 'Class', 'Temporary Password'],
      result.created.map(c => [c.studentId, c.firstName, c.lastName, c.className ?? '', c.tempPassword]),
    );
  }

  function toggleRow(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  const importable = analysis?.rows.filter(r => r.status !== 'error') ?? [];
  const allSelected = importable.length > 0 && importable.every(r => selected.has(r.rowIndex));

  return (
    <Modal open={open} onClose={handleClose} title="Import students" width="max-w-3xl">
      {error && (
        <div className="mb-4 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* ── Step 1: upload ── */}
      {step === 'upload' && (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Upload a spreadsheet (<span className="font-medium">.xlsx</span> or <span className="font-medium">.csv</span>) of your existing
            students. Each row becomes a student with an auto-generated ID and portal login. Class and fee category are matched by name.
          </p>

          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-2"
            style={{ color: 'var(--accent)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Download template
          </button>

          <label
            className="block border-2 border-dashed border-slate-200 rounded-2xl px-6 py-10 text-center cursor-pointer hover:border-slate-300 transition"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <svg className="w-8 h-8 mx-auto text-slate-300 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <p className="text-sm font-medium text-slate-700">{busy ? 'Reading file…' : 'Click to choose a file or drag it here'}</p>
            <p className="text-xs text-slate-400 mt-1">First row must be column headers</p>
          </label>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Expected columns</p>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map(c => (
                <span key={c.key} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs text-slate-600">
                  {c.header}{c.required && <span className="text-red-400">*</span>}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">* required · others optional · extra columns are ignored</p>
          </div>
        </div>
      )}

      {/* ── Step 2: preview ── */}
      {step === 'preview' && analysis && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-slate-500">{fileName} —</span>
            <Pill tone="ok">{analysis.summary.ok} ready</Pill>
            {analysis.summary.warning > 0 && <Pill tone="warning">{analysis.summary.warning} need a look</Pill>}
            {analysis.summary.error > 0 && <Pill tone="error">{analysis.summary.error} can’t import</Pill>}
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="max-h-[46vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wide">
                    <th className="px-3 py-2 w-9">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(importable.map(r => r.rowIndex)))}
                        className="w-4 h-4 rounded cursor-pointer"
                        aria-label="Select all importable rows"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left hidden sm:table-cell">DOB</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">Guardian</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map(r => {
                    const isError = r.status === 'error';
                    return (
                      <tr key={r.rowIndex} className={`border-b border-slate-50 ${isError ? 'bg-red-50/40' : ''}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            disabled={isError}
                            checked={selected.has(r.rowIndex)}
                            onChange={() => toggleRow(r.rowIndex)}
                            className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Include row ${r.rowIndex + 1}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-800 whitespace-nowrap">
                          {r.resolved.firstName || <span className="text-slate-300">—</span>} {r.resolved.lastName}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {r.resolved.className ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap hidden sm:table-cell">
                          {r.resolved.dateOfBirth ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap hidden md:table-cell">
                          {r.resolved.guardian?.name ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {isError ? (
                            <span className="text-xs text-red-600">{r.errors.join('; ')}</span>
                          ) : r.warnings.length ? (
                            <span className="text-xs text-amber-600">{r.warnings.join('; ')}</span>
                          ) : (
                            <span className="text-xs text-emerald-600">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              onClick={() => { reset(); }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              ← Choose another file
            </button>
            <button
              onClick={runImport}
              disabled={busy || selected.size === 0}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {busy ? 'Importing…' : `Import ${selected.size} student${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: result ── */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: 'var(--accent)' }}>✓</div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {result.summary.created} student{result.summary.created !== 1 ? 's' : ''} imported
              </p>
              {result.summary.skipped > 0 && (
                <p className="text-xs text-slate-500">{result.summary.skipped} row{result.summary.skipped !== 1 ? 's' : ''} skipped</p>
              )}
            </div>
          </div>

          {result.created.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Portal login details</p>
              <p className="text-xs text-amber-700 mb-2">
                Each student got a temporary password. Download the list now — passwords are only shown here.
              </p>
              <button
                onClick={downloadCredentials}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Download login details (CSV)
              </button>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {result.skipped.map(s => (
                    <tr key={s.rowIndex} className="border-b border-slate-50">
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">Row {s.rowIndex + 1}</td>
                      <td className="px-3 py-2 text-red-600 text-xs">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
            <button
              onClick={reset}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Import more
            </button>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Pill({ tone, children }: { tone: 'ok' | 'warning' | 'error'; children: React.ReactNode }) {
  const cls = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  }[tone];
  return <span className={`px-2 py-0.5 rounded-md border text-xs font-medium ${cls}`}>{children}</span>;
}
