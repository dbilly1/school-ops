'use client';

import { useState, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { SettingsCard, SaveButton, Alert } from '@/components/ui/settings-card';

type ReportCardConfig = {
  showRawScore: boolean;
  showGradeLabel: boolean;
  showAttendanceSummary: boolean;
  showBehaviourScores: boolean;
  showTeacherComments: boolean;
  showPrincipalComments: boolean;
  showNextTermInfo: boolean;
  footerText: string | null;
};

type Toggle = { key: keyof ReportCardConfig; label: string; description: string };

const TOGGLES: Toggle[] = [
  { key: 'showRawScore',           label: 'Raw score',           description: 'Display the numeric score alongside the grade label.' },
  { key: 'showGradeLabel',         label: 'Grade label',         description: 'Display the derived grade (A, Excellent, 4.0, etc.).' },
  { key: 'showAttendanceSummary',  label: 'Attendance summary',  description: 'Include number of days present/absent for the term.' },
  { key: 'showBehaviourScores',    label: 'Behaviour / conduct', description: 'Include a conduct section on the report card.' },
  { key: 'showTeacherComments',    label: 'Teacher comments',    description: 'Allow class teachers to add a comment per student.' },
  { key: 'showPrincipalComments',  label: "Head teacher's remarks", description: "Include the head teacher's or principal's remarks section." },
  { key: 'showNextTermInfo',       label: 'Next term information', description: 'Show next term start date and any notices on the report.' },
];

export default function ReportCardConfigPage() {
  const [config, setConfig] = useState<ReportCardConfig>({
    showRawScore: true, showGradeLabel: true, showAttendanceSummary: true,
    showBehaviourScores: false, showTeacherComments: true,
    showPrincipalComments: true, showNextTermInfo: true, footerText: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    staffApi.get<ReportCardConfig>('/school/report-card-config')
      .then(data => setConfig(data))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof ReportCardConfig) {
    setConfig(c => ({ ...c, [key]: !c[key] }));
  }

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.patch('/school/report-card-config', config);
      setAlert({ type: 'success', message: 'Report card layout saved.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Report Card Layout</h2>
        <p className="text-sm text-slate-500 mt-0.5">Configure what appears on each student's term report card.</p>
      </div>

      <SettingsCard title="Sections" description="Toggle each section on or off. Changes apply to the next generated report." footer={<SaveButton loading={saving} onClick={save} />}>
        {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}
        <div className="space-y-4">
          {TOGGLES.map(({ key, label, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(key)}
                className="mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={config[key] ? { backgroundColor: 'var(--accent)' } : { backgroundColor: '#e2e8f0' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${config[key] ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Footer text" description="Appears at the bottom of every report card. Optional." footer={<SaveButton loading={saving} onClick={save} />}>
        <textarea
          value={config.footerText ?? ''}
          onChange={e => setConfig(c => ({ ...c, footerText: e.target.value || null }))}
          rows={3}
          placeholder="e.g. 'This report is computer-generated and does not require a signature.'"
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none resize-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
      </SettingsCard>
    </div>
  );
}
