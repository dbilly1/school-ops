// Reusable card shell for settings pages

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function SettingsCard({ title, description, children, footer }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-5 border-b border-slate-100">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          {footer}
        </div>
      )}
    </div>
  );
}

// ── Shared form field ─────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
};

export function FormField({ label, hint, required, children }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ── Text input ────────────────────────────────────────────────────────────────

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none transition ${className ?? ''}`}
      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; props.onFocus?.(e); }}
      onBlur={e => { e.currentTarget.style.boxShadow = ''; props.onBlur?.(e); }}
    />
  );
}

// ── Save button ───────────────────────────────────────────────────────────────

type SaveButtonProps = {
  loading?: boolean;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
};

export function SaveButton({ loading, label = 'Save changes', onClick, disabled }: SaveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
      style={{ backgroundColor: 'var(--accent)' }}
      onMouseEnter={e => !(loading || disabled) && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
      onMouseLeave={e => !(loading || disabled) && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
    >
      {loading ? 'Saving…' : label}
    </button>
  );
}

// ── Inline alert ──────────────────────────────────────────────────────────────

export function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  const styles = type === 'error'
    ? 'bg-red-50 border-red-100 text-red-600'
    : 'bg-emerald-50 border-emerald-100 text-emerald-700';
  return (
    <div className={`px-3.5 py-2.5 rounded-lg border text-sm ${styles}`}>{message}</div>
  );
}
