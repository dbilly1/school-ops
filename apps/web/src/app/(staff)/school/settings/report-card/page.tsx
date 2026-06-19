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
  showPosition: boolean;
  showAssessmentScale: boolean;
  showMetricsTable: boolean;
  reportCardLayout: 'STANDARD' | 'HOLISTIC';
  sbaWeight: number;
  examWeight: number;
  footerText: string | null;
};

type BoolKey = Exclude<keyof ReportCardConfig, 'footerText' | 'sbaWeight' | 'examWeight' | 'reportCardLayout'>;
type Toggle = { key: BoolKey; label: string; description: string };

const TOGGLES: Toggle[] = [
  { key: 'showRawScore',           label: 'Raw score',           description: 'Display the numeric score alongside the grade label.' },
  { key: 'showGradeLabel',         label: 'Grade label',         description: 'Display the derived grade (A, Excellent, 4.0, etc.).' },
  { key: 'showPosition',           label: 'Class position',      description: 'Show the student’s position/rank in class and the aggregate.' },
  { key: 'showAttendanceSummary',  label: 'Attendance summary',  description: 'Include number of days present/absent for the term.' },
  { key: 'showBehaviourScores',    label: 'Attitudes, interests & conduct', description: 'Include the GES attitudes/interests/conduct section.' },
  { key: 'showAssessmentScale',    label: 'Assessment scale (Holistic Development)', description: 'Show the proficiency scale + holistic skills table. Configure the levels & skills below.' },
  { key: 'showMetricsTable',       label: 'Metrics table',       description: 'Show the grade-band key (from your grading scale) on the report.' },
  { key: 'showTeacherComments',    label: 'Teacher comments',    description: 'Allow class teachers to add a comment per student.' },
  { key: 'showPrincipalComments',  label: "Head teacher's remarks", description: "Include the head teacher's or principal's remarks section." },
  { key: 'showNextTermInfo',       label: 'Next term information', description: 'Show next term start date and any notices on the report.' },
];

// SBA component categories (everything except the end-of-term exam).
const SBA_CATEGORIES: { value: string; label: string }[] = [
  { value: 'CLASS_EXERCISE', label: 'Class Exercise' },
  { value: 'CLASS_TEST',     label: 'Class Test' },
  { value: 'GROUP_WORK',     label: 'Group Work' },
  { value: 'PROJECT',        label: 'Project Work' },
  { value: 'HOMEWORK',       label: 'Homework' },
  { value: 'MID_TERM',       label: 'Mid-Term' },
];

// ── Assessment scale editor (proficiency levels + holistic skills) ────────────

type LevelRow = { code: string; label: string; description: string };
type SkillRow = { label: string };

function AssessmentScaleEditor() {
  const [levels, setLevels]     = useState<LevelRow[]>([]);
  const [skills, setSkills]     = useState<SkillRow[]>([]);
  const [groupLabel, setGroupLabel] = useState('Holistic Development (Personal Growth & Learning Skills)');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    staffApi.get<{ levels: { code: string; label: string; description: string | null }[]; skills: { label: string; groupLabel: string | null }[] }>('/school/report-card-config/assessment-scale')
      .then(d => {
        setLevels(d.levels.map(l => ({ code: l.code, label: l.label, description: l.description ?? '' })));
        setSkills(d.skills.map(s => ({ label: s.label })));
        if (d.skills[0]?.groupLabel) setGroupLabel(d.skills[0].groupLabel);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.put('/school/report-card-config/assessment-scale', {
        levels: levels.filter(l => l.code.trim() && l.label.trim()).map((l, i) => ({ code: l.code.trim(), label: l.label.trim(), description: l.description.trim() || undefined, sequence: i })),
        skills: skills.filter(s => s.label.trim()).map((s, i) => ({ label: s.label.trim(), groupLabel: groupLabel.trim() || undefined, sequence: i })),
      });
      setAlert({ type: 'success', message: 'Assessment scale saved.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <SettingsCard
      title="Assessment scale & holistic skills"
      description="Used by the Assessment Scale section. Defaults shown — edit, add or remove. Turn the section off above if your school doesn't use it."
      footer={<SaveButton loading={saving} onClick={save} label="Save scale" />}
    >
      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Proficiency levels */}
      <p className="text-sm font-semibold text-slate-700 mb-2">Proficiency levels</p>
      <div className="space-y-2 mb-5">
        {levels.map((l, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input value={l.code} onChange={e => setLevels(ls => ls.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} placeholder="EX" className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" />
            <input value={l.label} onChange={e => setLevels(ls => ls.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Expected" className="w-40 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" />
            <input value={l.description} onChange={e => setLevels(ls => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description (optional)" className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" />
            <button type="button" onClick={() => setLevels(ls => ls.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400 text-lg leading-none">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setLevels(ls => [...ls, { code: '', label: '', description: '' }])} className="text-sm" style={{ color: 'var(--accent)' }}>+ Add level</button>
      </div>

      {/* Group heading */}
      <label className="block text-xs font-medium text-slate-500 mb-1">Skills group heading</label>
      <input value={groupLabel} onChange={e => setGroupLabel(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none mb-4" />

      {/* Skills */}
      <p className="text-sm font-semibold text-slate-700 mb-2">Skills assessed</p>
      <div className="space-y-2">
        {skills.map((s, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input value={s.label} onChange={e => setSkills(ss => ss.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Learner stays focused and works independently." className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" />
            <button type="button" onClick={() => setSkills(ss => ss.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400 text-lg leading-none">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setSkills(ss => [...ss, { label: '' }])} className="text-sm" style={{ color: 'var(--accent)' }}>+ Add skill</button>
      </div>
    </SettingsCard>
  );
}

export default function ReportCardConfigPage() {
  const [config, setConfig] = useState<ReportCardConfig>({
    showRawScore: true, showGradeLabel: true, showAttendanceSummary: true,
    showBehaviourScores: false, showTeacherComments: true,
    showPrincipalComments: true, showNextTermInfo: true, showPosition: true,
    showAssessmentScale: false, showMetricsTable: false, reportCardLayout: 'STANDARD',
    sbaWeight: 50, examWeight: 50, footerText: null,
  });
  const [catWeights, setCatWeights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    staffApi.get<ReportCardConfig>('/school/report-card-config')
      .then(data => setConfig({ ...data, sbaWeight: Number(data.sbaWeight), examWeight: Number(data.examWeight) }))
      .finally(() => setLoading(false));
    staffApi.get<{ category: string; weight: number }[]>('/school/report-card-config/category-weights')
      .then(rows => setCatWeights(Object.fromEntries(rows.map(r => [r.category, String(Number(r.weight))]))))
      .catch(() => {});
  }, []);

  function toggle(key: BoolKey) {
    setConfig(c => ({ ...c, [key]: !c[key] }));
  }

  async function save() {
    if (Math.round(config.sbaWeight + config.examWeight) !== 100) {
      setAlert({ type: 'error', message: 'Class score and exam weights must add up to 100%.' });
      return;
    }
    setAlert(null); setSaving(true);
    try {
      // Send only editable fields — the API rejects id/schoolId/updatedAt etc.
      await staffApi.patch('/school/report-card-config', {
        showRawScore: config.showRawScore,
        showGradeLabel: config.showGradeLabel,
        showAttendanceSummary: config.showAttendanceSummary,
        showBehaviourScores: config.showBehaviourScores,
        showTeacherComments: config.showTeacherComments,
        showPrincipalComments: config.showPrincipalComments,
        showNextTermInfo: config.showNextTermInfo,
        showPosition: config.showPosition,
        showAssessmentScale: config.showAssessmentScale,
        showMetricsTable: config.showMetricsTable,
        reportCardLayout: config.reportCardLayout,
        sbaWeight: config.sbaWeight,
        examWeight: config.examWeight,
        footerText: config.footerText,
      });
      // Persist per-category SBA weights (empty values are dropped → equal weighting).
      const weights = Object.entries(catWeights)
        .filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))
        .map(([category, v]) => ({ category, weight: parseFloat(v) }));
      await staffApi.patch('/school/report-card-config/category-weights', { weights });
      setAlert({ type: 'success', message: 'Report card settings saved.' });
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

      <SettingsCard title="Layout" description="Pick the report card style. Both use your sections and grading; the holistic style leads with the Assessment Scale & Holistic Development table." footer={<SaveButton loading={saving} onClick={save} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { value: 'STANDARD', title: 'Standard', desc: 'Subjects-first terminal report. Assessment scale & metrics appear at the end if enabled.' },
            { value: 'HOLISTIC', title: 'Holistic', desc: 'Competency style: Assessment Scale & Holistic Development table lead, then subjects & metrics.' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setConfig(c => ({ ...c, reportCardLayout: opt.value }))}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition ${config.reportCardLayout === opt.value ? 'border-transparent text-white' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
              style={config.reportCardLayout === opt.value ? { backgroundColor: 'var(--accent)' } : {}}
            >
              <p className="font-semibold">{opt.title}</p>
              <p className={`text-xs mt-0.5 ${config.reportCardLayout === opt.value ? 'text-white/70' : 'text-slate-400'}`}>{opt.desc}</p>
            </button>
          ))}
        </div>
      </SettingsCard>

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

      <AssessmentScaleEditor />

      <SettingsCard
        title="Terminal grade weighting"
        description="How the class score (School-Based Assessment) and the end-of-term exam combine into the terminal grade. The GES standards-based default is 50 / 50; the two must add up to 100%."
        footer={<SaveButton loading={saving} onClick={save} />}
      >
        <div className="flex items-center gap-6">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Class score (SBA) %</label>
            <input
              type="number" min={0} max={100} value={config.sbaWeight}
              onChange={e => { const v = parseFloat(e.target.value) || 0; setConfig(c => ({ ...c, sbaWeight: v, examWeight: 100 - v })); }}
              className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none"
              onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow=''}
            />
          </div>
          <span className="text-slate-300 text-lg mt-5">+</span>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">End-of-term exam %</label>
            <input
              type="number" min={0} max={100} value={config.examWeight}
              onChange={e => { const v = parseFloat(e.target.value) || 0; setConfig(c => ({ ...c, examWeight: v, sbaWeight: 100 - v })); }}
              className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none"
              onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow=''}
            />
          </div>
          <span className={`text-sm mt-5 font-medium ${Math.round(config.sbaWeight + config.examWeight) === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
            = {Math.round(config.sbaWeight + config.examWeight)}%
          </span>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Class-score (SBA) component weights"
        description="Optional. Set how much each continuous-assessment type counts toward the class score. Leave blank for equal weighting across whatever components a student has."
        footer={<SaveButton loading={saving} onClick={save} />}
      >
        <div className="space-y-3">
          {SBA_CATEGORIES.map(cat => (
            <div key={cat.value} className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-700">{cat.label}</span>
              <input
                type="number" min={0} placeholder="equal"
                value={catWeights[cat.value] ?? ''}
                onChange={e => setCatWeights(w => ({ ...w, [cat.value]: e.target.value }))}
                className="w-24 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none text-right"
                onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'}
                onBlur={e => e.currentTarget.style.boxShadow=''}
              />
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
