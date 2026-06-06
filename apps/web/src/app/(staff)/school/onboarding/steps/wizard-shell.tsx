// Shared layout wrapper for each wizard step

type WizardShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

export function WizardShell({ title, description, children, footer }: WizardShellProps) {
  return (
    <div className="flex flex-col">
      {/* Step header */}
      <div className="px-8 py-6 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>

      {/* Step body */}
      <div className="px-8 py-6 min-h-64">
        {children}
      </div>

      {/* Step footer */}
      <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        {footer}
      </div>
    </div>
  );
}

// ── Reusable nav buttons ──────────────────────────────────────────────────────

type NavProps = {
  onBack?: () => void;
  onSkip?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
};

export function WizardNav({ onBack, onSkip, onNext, nextLabel = 'Continue', nextDisabled, loading }: NavProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-slate-500 hover:text-slate-700 transition font-medium"
          >
            ← Back
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-slate-400 hover:text-slate-600 transition"
          >
            Skip for now
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || loading}
        className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)' }}
        onMouseEnter={e => !(nextDisabled || loading) && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
        onMouseLeave={e => !(nextDisabled || loading) && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
      >
        {loading ? 'Saving…' : nextLabel}
      </button>
    </>
  );
}
