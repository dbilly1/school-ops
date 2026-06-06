'use client';

type Props = { onFinish: () => void; schoolName: string };

export function StepDone({ onFinish, schoolName }: Props) {
  return (
    <div className="px-8 py-12 flex flex-col items-center text-center">
      {/* Success mark */}
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: 'var(--accent-tint)' }}
      >
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        {schoolName} is ready!
      </h2>
      <p className="text-slate-500 text-sm max-w-sm mb-8">
        Your school has been set up. You can revisit any of these settings at any time from the Settings menu.
      </p>

      {/* What's next checklist */}
      <div className="w-full max-w-sm text-left space-y-3 mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Suggested next steps</p>
        {[
          'Invite your staff members',
          'Add your students',
          'Set up your school calendar',
          'Configure fee structures',
        ].map(step => (
          <div key={step} className="flex items-center gap-3">
            <div
              className="w-5 h-5 rounded-full border-2 shrink-0"
              style={{ borderColor: 'var(--accent)' }}
            />
            <span className="text-sm text-slate-600">{step}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition"
        style={{ backgroundColor: 'var(--accent)' }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
      >
        Go to my dashboard →
      </button>
    </div>
  );
}
