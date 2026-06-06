'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { publicPost, storeTokens, type ApiError } from '@/lib/api';

const COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Uganda', 'Tanzania',
  'Rwanda', 'Ethiopia', 'Zambia', 'Zimbabwe', 'Cameroon', 'Senegal',
  'Côte d\'Ivoire', 'United Kingdom', 'United States', 'Canada', 'Other',
];

type StaffUser = {
  id: string; schoolId: string; email: string;
  firstName: string; lastName: string; roles: string[];
  onboardingComplete: boolean;
};

type RegisterResponse = {
  accessToken: string;
  refreshToken: string;
  user: StaffUser;
};

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    schoolName:     '',
    country:        '',
    address:        '',
    phone:          '',
    ownerFirstName: '',
    ownerLastName:  '',
    ownerEmail:     '',
    ownerPassword:  '',
    confirmPassword: '',
  });
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.ownerPassword !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.ownerPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const { ownerPassword, confirmPassword, ...rest } = form;
      const data = await publicPost<RegisterResponse>('/schools/register', {
        ...rest,
        ownerPassword,
      });
      storeTokens('staff', data.accessToken, data.refreshToken);
      // Cache user so StaffAuthProvider hydrates instantly (no extra /me call)
      localStorage.setItem('so_staff_user', JSON.stringify(data.user));
      router.push('/school/onboarding');
    } catch (err) {
      setError((err as ApiError).message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">SchoolOps</span>
        </div>

        <div>
          <p className="text-white/70 text-sm mb-2 uppercase tracking-widest font-medium">
            Get started free
          </p>
          <h1 className="text-white text-3xl font-bold leading-snug">
            Set up your school<br />in minutes.
          </h1>
          <ul className="mt-6 space-y-3">
            {[
              'Multi-role staff management',
              'Student profiles & admissions',
              'Academic tracking & report cards',
              'Finance, feeding & transport',
            ].map(item => (
              <li key={item} className="flex items-center gap-2.5 text-white/80 text-sm">
                <svg className="w-4 h-4 shrink-0 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-white/40 text-xs">© {new Date().getFullYear()} SchoolOps</p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col justify-center items-center px-6 py-12">
          <div className="w-full max-w-lg">

            {/* Mobile logo */}
            <div className="flex items-center gap-2 mb-8 lg:hidden">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
                <span className="text-white font-bold">S</span>
              </div>
              <span className="font-semibold text-slate-800 text-lg">SchoolOps</span>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-1">Register your school</h2>
            <p className="text-slate-500 text-sm mb-8">
              Already have an account?{' '}
              <a href="/login" className="font-medium" style={{ color: 'var(--accent)' }}>Sign in</a>
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* ── School info ── */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                  School information
                </legend>
                <div className="space-y-4">
                  <Field label="School name" required>
                    <Input
                      value={form.schoolName}
                      onChange={set('schoolName')}
                      placeholder="St. Mary's International School"
                      required
                    />
                  </Field>

                  <Field label="Country" required>
                    <select
                      value={form.country}
                      onChange={set('country')}
                      required
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition"
                      onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                      onBlur={e => e.currentTarget.style.boxShadow = ''}
                    >
                      <option value="">Select a country</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Phone (optional)">
                      <Input value={form.phone} onChange={set('phone')} placeholder="+233 20 000 0000" />
                    </Field>
                    <Field label="Address (optional)">
                      <Input value={form.address} onChange={set('address')} placeholder="School address" />
                    </Field>
                  </div>
                </div>
              </fieldset>

              {/* ── Owner account ── */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                  Your account (School Owner)
                </legend>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="First name" required>
                      <Input
                        value={form.ownerFirstName}
                        onChange={set('ownerFirstName')}
                        placeholder="Kwame"
                        required
                      />
                    </Field>
                    <Field label="Last name" required>
                      <Input
                        value={form.ownerLastName}
                        onChange={set('ownerLastName')}
                        placeholder="Mensah"
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Email address" required>
                    <Input
                      type="email"
                      value={form.ownerEmail}
                      onChange={set('ownerEmail')}
                      placeholder="you@school.com"
                      required
                      autoComplete="email"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Password" required>
                      <Input
                        type="password"
                        value={form.ownerPassword}
                        onChange={set('ownerPassword')}
                        placeholder="Min. 8 characters"
                        required
                        autoComplete="new-password"
                      />
                    </Field>
                    <Field label="Confirm password" required>
                      <Input
                        type="password"
                        value={form.confirmPassword}
                        onChange={set('confirmPassword')}
                        placeholder="Repeat password"
                        required
                        autoComplete="new-password"
                      />
                    </Field>
                  </div>
                </div>
              </fieldset>

              {error && (
                <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)' }}
                onMouseEnter={e => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
                onMouseLeave={e => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
              >
                {loading ? 'Creating your school…' : 'Create school & continue'}
              </button>

              <p className="text-xs text-slate-400 text-center">
                By registering you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small shared components ───────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
}: {
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none transition"
      onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
      onBlur={e => e.currentTarget.style.boxShadow = ''}
    />
  );
}
