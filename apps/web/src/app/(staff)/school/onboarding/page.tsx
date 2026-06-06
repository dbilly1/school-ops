'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { staffApi } from '@/lib/api';

import { StepFeatures }        from './steps/step-features';
import { StepGradeStructure }  from './steps/step-grade-structure';
import { StepCategories }      from './steps/step-categories';
import { StepGrading }         from './steps/step-grading';
import { StepAcademicYear }    from './steps/step-academic-year';
import { StepDone }            from './steps/step-done';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 'features',       label: 'Features'       },
  { id: 'grade-structure',label: 'Grade Structure' },
  { id: 'categories',     label: 'Student Types'   },
  { id: 'grading',        label: 'Grading'         },
  { id: 'academic-year',  label: 'Academic Year'   },
  { id: 'done',           label: 'Done'            },
] as const;

type StepId = typeof STEPS[number]['id'];

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-1">
      <div
        className="h-1 rounded-full transition-all duration-500"
        style={{ width: `${(current / total) * 100}%`, backgroundColor: 'var(--accent)' }}
      />
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ steps, currentIndex }: { steps: typeof STEPS; currentIndex: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full transition-all"
            style={{
              backgroundColor: i < currentIndex
                ? 'var(--accent)'
                : i === currentIndex
                  ? 'var(--accent)'
                  : '#e2e8f0',
              opacity: i === currentIndex ? 1 : i < currentIndex ? 0.6 : 1,
            }}
          />
          {i < steps.length - 1 && (
            <div
              className="w-6 h-px transition-all"
              style={{ backgroundColor: i < currentIndex ? 'var(--accent)' : '#e2e8f0' }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user, branding, markOnboardingComplete } = useStaffAuth();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentStep = STEPS[currentIndex];
  const isLast = currentIndex === STEPS.length - 1;

  function next() {
    if (!isLast) setCurrentIndex(i => i + 1);
  }

  function back() {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }

  function skip() {
    next();
  }

  async function finish() {
    try {
      await staffApi.post('/school/profile/onboarding/complete');
    } catch {
      // Non-fatal — proceed anyway
    }
    // Update context state immediately so the layout guard lets us through
    markOnboardingComplete();
    router.push('/school/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              S
            </div>
            <span className="font-semibold text-slate-800 text-sm">SchoolOps</span>
          </div>
          <div className="flex items-center gap-5">
            <StepIndicator steps={STEPS} currentIndex={currentIndex} />
            {currentStep.id !== 'done' && (
              <button
                type="button"
                onClick={finish}
                className="text-xs text-slate-400 hover:text-slate-600 transition"
              >
                Skip all
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col items-center px-6 py-10">
        <div className="w-full max-w-2xl">

          {/* Step counter + progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">
                Step {currentIndex + 1} of {STEPS.length}
              </span>
              <span className="text-xs text-slate-400">{currentStep.label}</span>
            </div>
            <ProgressBar current={currentIndex + 1} total={STEPS.length} />
          </div>

          {/* Step content */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {currentStep.id === 'features'        && <StepFeatures onNext={next} onSkip={skip} />}
            {currentStep.id === 'grade-structure' && <StepGradeStructure onNext={next} onBack={back} onSkip={skip} />}
            {currentStep.id === 'categories'      && <StepCategories onNext={next} onBack={back} onSkip={skip} />}
            {currentStep.id === 'grading'         && <StepGrading onNext={next} onBack={back} onSkip={skip} />}
            {currentStep.id === 'academic-year'   && <StepAcademicYear onNext={next} onBack={back} onSkip={skip} />}
            {currentStep.id === 'done'            && <StepDone onFinish={finish} schoolName={branding?.name ?? user?.firstName + "'s School"} />}
          </div>
        </div>
      </div>
    </div>
  );
}
