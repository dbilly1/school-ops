'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert, FormField, Input } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type Vehicle  = { id: string; make: string; model: string; plateNumber: string; capacity: number };
type Driver   = { id: string; name: string; phone: string | null; licenseNumber: string | null };
type PickupPoint = { id: string; name: string; order: number };
type Student  = { id: string; studentId: string; firstName: string; lastName: string };
type Assignment = { id: string; student: Student };
type Route    = {
  id: string; name: string; dailyRate: number;
  vehicle: Vehicle | null; driver: Driver | null;
  pickupPoints: PickupPoint[];
  studentAssignments: Assignment[];
  _count: { studentAssignments: number };
};

// Daily-fee collection — shape returned by GET /school/transport-fees/daily/:routeId
type DailyFeeStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID';
type CollectionRow = {
  student: Student;
  status: DailyFeeStatus;
  owedDays: number;
  owedAmount: number;
};
type DailyCollection = {
  date: string;
  routeId: string;
  dailyRate: number;
  isSchoolDay: boolean;
  rows: CollectionRow[];
  summary: { total: number; paid: number; preCovered: number; absent: number; unpaid: number };
};

const STATUS_CONFIG: Record<DailyFeeStatus, { label: string; color: string; bg: string }> = {
  PAID:        { label: 'Paid',        color: '#22c55e', bg: '#f0fdf4' },
  PRE_COVERED: { label: 'Pre-covered', color: '#3b82f6', bg: '#eff6ff' },
  ABSENT:      { label: 'Absent',      color: '#94a3b8', bg: '#f8fafc' },
  UNPAID:      { label: 'Unpaid',      color: '#ef4444', bg: '#fef2f2' },
};

// Per-student payment calendar — GET /school/transport-fees/student/:id/calendar
type CalendarStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID' | 'NON_SCHOOL' | 'PROJECTED' | 'NONE';
type CalendarDay = { date: string; isSchoolDay: boolean; status: CalendarStatus };
type StudentCalendar = {
  studentId: string;
  student: Student;
  month: string;
  dailyRate: number;
  balance: number;
  owedDays: number;
  owedAmount: number;
  days: CalendarDay[];
};

const CAL_CONFIG: Record<CalendarStatus, { label: string; color: string; bg: string; border: string }> = {
  PAID:        { label: 'Paid',       color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
  PRE_COVERED: { label: 'Prepaid',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
  PROJECTED:   { label: 'Projected',  color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe' },
  UNPAID:      { label: 'Unpaid',     color: '#b91c1c', bg: '#fee2e2', border: '#fecaca' },
  ABSENT:      { label: 'Absent',     color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  NON_SCHOOL:  { label: 'Non-school', color: '#cbd5e1', bg: '#f8fafc', border: '#f1f5f9' },
  NONE:        { label: '—',          color: '#94a3b8', bg: '#ffffff', border: '#f1f5f9' },
};

type Tab = 'routes' | 'vehicles' | 'drivers' | 'fees';

// ── Routes tab ────────────────────────────────────────────────────────────────

function RoutesTab() {
  const [showNew, setShowNew]   = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers]   = useState<Driver[]>([]);
  const [form, setForm]         = useState({ name: '', dailyRate: '', vehicleId: '', driverId: '' });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchRoutes  = useCallback(() => staffApi.get<Route[]>('/school/transport/routes'), []);
  const fetchV       = useCallback(() => staffApi.get<Vehicle[]>('/school/transport/vehicles'), []);
  const fetchD       = useCallback(() => staffApi.get<Driver[]>('/school/transport/drivers'), []);
  const { data: routes, loading, refetch } = useApi(fetchRoutes);
  const { data: vData } = useApi(fetchV);
  const { data: dData } = useApi(fetchD);

  useEffect(() => { if (vData) setVehicles(vData); }, [vData]);
  useEffect(() => { if (dData) setDrivers(dData); }, [dData]);

  // Student assignment
  const fetchStudents = useCallback(() => staffApi.get<Student[]>('/school/students'), []);
  const { data: students } = useApi(fetchStudents);
  const [assigningRoute, setAssigningRoute] = useState('');
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function createRoute() {
    if (!form.name || !form.dailyRate) { setError('Name and daily rate are required.'); return; }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/transport/routes', {
        name: form.name,
        dailyRate: parseFloat(form.dailyRate),
        vehicleId: form.vehicleId || null,
        driverId: form.driverId || null,
      });
      setForm({ name:'', dailyRate:'', vehicleId:'', driverId:'' });
      setShowNew(false); refetch();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create route.');
    } finally {
      setSaving(false);
    }
  }

  async function assignStudent(routeId: string) {
    if (!assignStudentId) return;
    setAssignError(null); setAssigning(true);
    try {
      await staffApi.post('/school/transport/assignments', { studentId: assignStudentId, transportRouteId: routeId });
      setAssignStudentId(''); setAssigningRoute(''); refetch();
    } catch (err) {
      setAssignError((err as ApiError).message ?? 'Failed to assign student.');
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssignment(studentId: string) {
    setRemoving(studentId);
    try {
      await staffApi.delete(`/school/transport/assignments/${studentId}`);
      refetch();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
          + Add route
        </button>
      </div>

      {loading && <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}</div>}

      <div className="space-y-4">
        {routes?.map(route => (
          <div key={route.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">{route.name}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                  <span>GHS {route.dailyRate}/day</span>
                  {route.vehicle && <span>{route.vehicle.plateNumber} ({route.vehicle.make} {route.vehicle.model})</span>}
                  {route.driver  && <span>Driver: {route.driver.name}</span>}
                  <span className="font-medium" style={{ color: 'var(--accent)' }}>{route._count.studentAssignments} students</span>
                </div>
              </div>
            </div>

            {/* Pickup points */}
            {route.pickupPoints.length > 0 && (
              <div className="px-5 py-3 border-b border-slate-50 flex flex-wrap gap-2">
                {route.pickupPoints.sort((a,b) => a.order - b.order).map(p => (
                  <span key={p.id} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{p.name}</span>
                ))}
              </div>
            )}

            {/* Assigned students */}
            <div className="px-5 py-3 border-b border-slate-50">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Assigned students
              </p>
              {route.studentAssignments.length === 0 ? (
                <p className="text-sm text-slate-400">No students assigned yet.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {route.studentAssignments.map(({ id, student }) => (
                    <li key={id} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-slate-700">
                        {student.lastName}, {student.firstName}
                        <span className="ml-2 text-xs font-mono text-slate-400">{student.studentId}</span>
                      </span>
                      <button onClick={() => removeAssignment(student.id)} disabled={removing === student.id}
                        className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50">
                        {removing === student.id ? '…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Assign student */}
            <div className="px-5 py-3 flex gap-2">
              <select
                value={assigningRoute === route.id ? assignStudentId : ''}
                onChange={e => { setAssigningRoute(route.id); setAssignStudentId(e.target.value); setAssignError(null); }}
                className="flex-1 text-sm px-3 py-1.5 border border-slate-200 rounded-lg outline-none text-slate-700"
              >
                <option value="">Assign student to this route…</option>
                {students?.map(s => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.studentId})</option>)}
              </select>
              {assigningRoute === route.id && assignStudentId && (
                <button onClick={() => assignStudent(route.id)} disabled={assigning}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  {assigning ? '…' : 'Assign'}
                </button>
              )}
            </div>
            {assigningRoute === route.id && assignError && (
              <div className="px-5 pb-3 -mt-1">
                <Alert type="error" message={assignError} />
              </div>
            )}
          </div>
        ))}

        {!loading && (!routes || routes.length === 0) && (
          <div className="bg-white rounded-2xl border border-slate-100 px-6 py-12 text-center text-sm text-slate-400">
            No routes yet.
          </div>
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add transport route">
        <div className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Route name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Accra North Route" />
            </FormField>
            <FormField label="Daily rate (GHS)" required>
              <Input type="number" value={form.dailyRate} onChange={e => setForm(f => ({ ...f, dailyRate: e.target.value }))} placeholder="0.00" />
            </FormField>
            <FormField label="Vehicle (optional)">
              <select value={form.vehicleId} onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                <option value="">None</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} — {v.make} {v.model}</option>)}
              </select>
            </FormField>
            <FormField label="Driver (optional)">
              <select value={form.driverId} onChange={e => setForm(f => ({ ...f, driverId: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                <option value="">None</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
          </div>
          <div className="flex justify-end">
            <SaveButton loading={saving} onClick={createRoute} label="Create route" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Vehicles tab ──────────────────────────────────────────────────────────────

function VehiclesTab() {
  const [form, setForm] = useState({ make:'', model:'', plateNumber:'', capacity:'50' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fetchVehicles = useCallback(() => staffApi.get<Vehicle[]>('/school/transport/vehicles'), []);
  const { data: vehicles, loading, refetch } = useApi(fetchVehicles);

  async function create() {
    if (!form.make || !form.model || !form.plateNumber) { setError('Make, model, and plate are required.'); return; }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/transport/vehicles', { ...form, capacity: parseInt(form.capacity) });
      setForm({ make:'', model:'', plateNumber:'', capacity:'50' });
      refetch();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteVehicle(id: string) {
    if (!confirm('Delete this vehicle?')) return;
    await staffApi.delete(`/school/transport/vehicles/${id}`);
    refetch();
  }

  return (
    <div className="space-y-4">
      {error && <Alert type="error" message={error} />}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Make', 'Model', 'Plate', 'Capacity', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:3}).map((_,i) => (
              <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-6 bg-slate-100 rounded animate-pulse" /></td></tr>
            ))}
            {vehicles?.map(v => (
              <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                <td className="px-4 py-3 text-sm text-slate-700">{v.make}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{v.model}</td>
                <td className="px-4 py-3 text-sm font-mono text-slate-600">{v.plateNumber}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{v.capacity}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteVehicle(v.id)} className="text-xs text-red-400 hover:text-red-600 transition">Delete</button>
                </td>
              </tr>
            ))}
            {!loading && (!vehicles || vehicles.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No vehicles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Add vehicle</p>
        <div className="grid grid-cols-4 gap-3">
          <FormField label="Make"><Input value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Toyota" /></FormField>
          <FormField label="Model"><Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Hiace" /></FormField>
          <FormField label="Plate number"><Input value={form.plateNumber} onChange={e => setForm(f => ({ ...f, plateNumber: e.target.value }))} placeholder="GR-1234-20" /></FormField>
          <FormField label="Capacity"><Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} /></FormField>
        </div>
        <div className="flex justify-end mt-3">
          <SaveButton loading={saving} onClick={create} label="Add vehicle" />
        </div>
      </div>
    </div>
  );
}

// ── Drivers tab ───────────────────────────────────────────────────────────────

function DriversTab() {
  const [form, setForm] = useState({ name:'', phone:'', licenseNumber:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fetchDrivers = useCallback(() => staffApi.get<Driver[]>('/school/transport/drivers'), []);
  const { data: drivers, loading, refetch } = useApi(fetchDrivers);

  async function create() {
    if (!form.name) { setError('Name is required.'); return; }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/transport/drivers', { name: form.name, phone: form.phone || null, licenseNumber: form.licenseNumber || null });
      setForm({ name:'', phone:'', licenseNumber:'' });
      refetch();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDriver(id: string) {
    if (!confirm('Delete this driver?')) return;
    await staffApi.delete(`/school/transport/drivers/${id}`);
    refetch();
  }

  return (
    <div className="space-y-4">
      {error && <Alert type="error" message={error} />}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Name', 'Phone', 'License', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:3}).map((_,i) => (
              <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-6 bg-slate-100 rounded animate-pulse" /></td></tr>
            ))}
            {drivers?.map(d => (
              <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{d.name}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{d.phone ?? '—'}</td>
                <td className="px-4 py-3 text-xs font-mono text-slate-500">{d.licenseNumber ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteDriver(d.id)} className="text-xs text-red-400 hover:text-red-600 transition">Delete</button>
                </td>
              </tr>
            ))}
            {!loading && (!drivers || drivers.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No drivers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Add driver</p>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Full name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Driver name" /></FormField>
          <FormField label="Phone"><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+233 20 000 0000" /></FormField>
          <FormField label="License number"><Input value={form.licenseNumber} onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))} placeholder="License #" /></FormField>
        </div>
        <div className="flex justify-end mt-3">
          <SaveButton loading={saving} onClick={create} label="Add driver" />
        </div>
      </div>
    </div>
  );
}

// ── Per-student prepay calendar modal ──────────────────────────────────────────

function PrepayCalendarModal({ studentId, studentName, onClose, onChanged }: {
  studentId: string;
  studentName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [month, setMonth]   = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [view, setView]     = useState<'month' | 'week'>('month');
  const [weekIdx, setWeekIdx] = useState(0);
  const [addDays, setAddDays] = useState(1);
  const [refundDays, setRefundDays] = useState(1);
  const [showRefund, setShowRefund] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchCal = useCallback(
    () => staffApi.get<StudentCalendar>(`/school/transport-fees/student/${studentId}/calendar?month=${month}`),
    [studentId, month],
  );
  const { data: cal, loading, refetch } = useApi(fetchCal, `${studentId}:${month}`);

  // Build Sun–Sat week rows from the month's days
  const weeks: (CalendarDay | null)[][] = [];
  if (cal && cal.days.length) {
    const firstWeekday = new Date(`${cal.days[0].date}T00:00:00`).getDay();
    let week: (CalendarDay | null)[] = Array(firstWeekday).fill(null);
    for (const d of cal.days) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }
  }

  // On switching to week view (or new data) jump to the week containing today
  useEffect(() => {
    if (view === 'week' && weeks.length) {
      const idx = weeks.findIndex(w => w.some(d => d?.date === todayKey));
      setWeekIdx(idx >= 0 ? idx : 0);
    }
  }, [view, cal]); // eslint-disable-line react-hooks/exhaustive-deps

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    setWeekIdx(0);
  }

  const rate    = cal?.dailyRate ?? 0;
  const balance = cal?.balance ?? 0;
  const owedDays   = cal?.owedDays ?? 0;
  const owedAmount = cal?.owedAmount ?? 0;
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' });
  const shownWeeks = view === 'week' ? weeks.slice(weekIdx, weekIdx + 1) : weeks;

  async function act(run: () => Promise<unknown>, success?: string) {
    setBusy(true); setAlert(null);
    try {
      await run();
      await refetch(); onChanged();
      if (success) setAlert({ type: 'success', message: success });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  function dayCell(d: CalendarDay | null, i: number) {
    if (!d) return <div key={i} />;
    const cfg = CAL_CONFIG[d.status];
    const dayNum = Number(d.date.split('-')[2]);
    const isToday = d.date === todayKey;
    const settleable = d.status === 'UNPAID' && d.date <= todayKey && d.isSchoolDay;
    return (
      <button key={i} type="button" disabled={!settleable || busy}
        onClick={() => settleable && act(() => staffApi.post('/school/transport-fees/mark-paid', { studentId, date: d.date }))}
        title={settleable ? 'Mark this day paid (cash)' : cfg.label}
        className={cn(
          'aspect-square rounded-lg flex flex-col items-center justify-center text-xs leading-none gap-0.5 transition',
          settleable ? 'cursor-pointer hover:ring-2 hover:ring-emerald-300' : 'cursor-default',
        )}
        style={{ backgroundColor: cfg.bg, color: cfg.color, border: `${isToday ? 2 : 1}px solid ${isToday ? 'var(--accent)' : cfg.border}` }}>
        <span className="font-semibold">{dayNum}</span>
        {d.status === 'PAID' && <span>✓</span>}
        {d.status === 'PRE_COVERED' && <span>●</span>}
        {d.status === 'PROJECTED' && <span>◌</span>}
      </button>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Transport payments — ${studentName}`} width="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
              Prepaid balance: {balance} day{balance === 1 ? '' : 's'}
            </div>
            {owedAmount > 0 && (
              <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#fffbeb', color: '#b45309' }}>
                Owes: GHS {owedAmount.toFixed(2)}
              </div>
            )}
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-3 py-1 rounded-md text-xs font-medium capitalize transition',
                  view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{v}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => view === 'week' ? setWeekIdx(i => Math.max(0, i - 1)) : shiftMonth(-1)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none">‹</button>
          <p className="text-sm font-semibold text-slate-700">{monthLabel}</p>
          <button onClick={() => view === 'week' ? setWeekIdx(i => Math.min(weeks.length - 1, i + 1)) : shiftMonth(1)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none">›</button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
        </div>

        {loading ? (
          <div className="h-44 bg-slate-50 rounded-xl animate-pulse" />
        ) : (
          <div className="space-y-1.5">
            {shownWeeks.map((w, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">{w.map((d, di) => dayCell(d, di))}</div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {(['PAID','PRE_COVERED','PROJECTED','UNPAID','ABSENT','NON_SCHOOL'] as CalendarStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: CAL_CONFIG[s].bg, border: `1px solid ${CAL_CONFIG[s].border}` }} />
              {CAL_CONFIG[s].label}
            </span>
          ))}
        </div>

        {alert && <Alert type={alert.type} message={alert.message} />}

        {owedAmount > 0 && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-sm text-amber-800">
              Outstanding arrears: <span className="font-semibold">GHS {owedAmount.toFixed(2)}</span> ({owedDays} day{owedDays === 1 ? '' : 's'})
            </span>
            <button onClick={() => act(() => staffApi.post('/school/transport-fees/settle-arrears', { studentId }), `Settled GHS ${owedAmount.toFixed(2)} of arrears.`)}
              disabled={busy}
              className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition disabled:opacity-50">
              {busy ? '…' : 'Settle all'}
            </button>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Add prepaid days</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center border border-slate-200 rounded-lg">
              <button onClick={() => setAddDays(d => Math.max(1, d - 1))} className="px-3 py-1.5 text-slate-500 hover:bg-slate-50">−</button>
              <input type="number" min={1} value={addDays}
                onChange={e => setAddDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 text-center text-sm py-1.5 outline-none" />
              <button onClick={() => setAddDays(d => d + 1)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-50">+</button>
            </div>
            <span className="text-sm text-slate-500">
              × GHS {rate} = <span className="font-semibold text-slate-800">GHS {(addDays * rate).toFixed(2)}</span>
            </span>
            <button onClick={() => act(() => staffApi.post('/school/transport-fees/prepay', { studentId, days: addDays }), `Added ${addDays} prepaid day(s).`)}
              disabled={busy || rate <= 0}
              className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}>
              {busy ? '…' : 'Add payment'}
            </button>
          </div>
          {rate <= 0 && <p className="text-xs text-amber-600">No daily rate set for this student&apos;s route.</p>}

          {balance > 0 && (showRefund ? (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-slate-500">Refund</span>
              <input type="number" min={1} max={balance} value={refundDays}
                onChange={e => setRefundDays(Math.min(balance, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-14 text-center text-sm py-1 border border-slate-200 rounded-lg outline-none" />
              <span className="text-slate-500">unused day(s)</span>
              <button onClick={() => act(() => staffApi.post('/school/transport-fees/refund-balance', { studentId, days: refundDays }), `Refunded ${refundDays} day(s).`).then(() => setShowRefund(false))}
                disabled={busy}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50">Confirm refund</button>
              <button onClick={() => setShowRefund(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setShowRefund(true); setRefundDays(1); }} className="text-xs text-slate-400 hover:text-red-500 transition">
              Refund unused days
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Transport fees tab ────────────────────────────────────────────────────────

function TransportFeesTab() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [routeId, setRouteId] = useState('');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [calendarStudent, setCalendarStudent] = useState<Student | null>(null);

  const fetchRoutes     = useCallback(() => staffApi.get<Route[]>('/school/transport/routes'), []);
  const fetchCollection = useCallback(
    () => routeId
      ? staffApi.get<DailyCollection>(`/school/transport-fees/daily/${routeId}?date=${date}`).catch(() => null)
      : Promise.resolve(null),
    [routeId, date],
  );

  const { data: routes }                          = useApi(fetchRoutes);
  const { data: collection, loading, refetch }    = useApi(fetchCollection, `${routeId}:${date}`);

  // Auto-select the first route once routes load
  useEffect(() => {
    if (!routeId && routes && routes.length > 0) setRouteId(routes[0].id);
  }, [routes]);

  const rows        = collection?.rows ?? [];
  const summary     = collection?.summary;
  const isSchoolDay = collection?.isSchoolDay ?? true;
  const cashToday   = summary ? summary.paid * (collection?.dailyRate ?? 0) : 0;
  const totalOwed   = rows.reduce((s, r) => s + r.owedAmount, 0);

  async function markPaid(studentId: string) {
    setMarkingPaid(studentId);
    try {
      await staffApi.post('/school/transport-fees/mark-paid', { studentId, date });
    } catch {
      // Stale row (e.g. already prepaid) — resync below rather than throw.
    } finally {
      setMarkingPaid(null);
      refetch();
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {/* Route tabs */}
      {routes && routes.length > 0 && (
        <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto scrollbar-none">
          {routes.map(r => {
            const active = routeId === r.id;
            return (
              <button key={r.id} onClick={() => setRouteId(r.id)}
                className="shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
                style={active
                  ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : { color: '#64748b', borderColor: 'transparent' }}>
                {r.name}
              </button>
            );
          })}
        </div>
      )}

      {routes && routes.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-12 text-center text-sm text-slate-400">
          No routes yet. Create a route first.
        </div>
      )}

      {routeId && !loading && !isSchoolDay && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          This date is not a school day. Payments cannot be recorded.
        </div>
      )}

      {routeId && summary && (
        <div className="flex gap-4 mb-4">
          {[
            { label: 'Paid', value: summary.paid, color: '#22c55e' },
            { label: 'Unpaid today', value: summary.unpaid, color: '#ef4444' },
            { label: 'Cash today', value: `GHS ${cashToday.toFixed(2)}`, color: 'var(--accent)' },
            { label: 'Outstanding', value: `GHS ${totalOwed.toFixed(2)}`, color: '#b45309' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3 text-center">
              <p className="text-xs text-slate-400">{c.label}</p>
              <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {routeId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Owes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({length:6}).map((_,i) => (
                <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td></tr>
              ))}
              {!loading && rows.map(row => {
                const cfg    = STATUS_CONFIG[row.status];
                const canPay = row.status === 'UNPAID' && isSchoolDay;
                return (
                  <tr key={row.student.id} className={cn('border-b border-slate-50', row.status === 'ABSENT' ? 'opacity-50' : 'hover:bg-slate-50/40 transition')}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{row.student.lastName}, {row.student.firstName}</p>
                      <p className="text-xs font-mono text-slate-400">{row.student.studentId}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {row.owedAmount > 0
                        ? <span className="text-sm font-semibold text-amber-700" title={`${row.owedDays} unpaid day(s)`}>GHS {row.owedAmount.toFixed(2)}</span>
                        : <span className="text-slate-300 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canPay && (
                        <button onClick={() => markPaid(row.student.id)} disabled={markingPaid === row.student.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: '#22c55e' }}>
                          {markingPaid === row.student.id ? '…' : 'Mark paid'}
                        </button>
                      )}
                      <button onClick={() => setCalendarStudent(row.student)}
                        className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                        Payments
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">No students on this route.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {calendarStudent && (
        <PrepayCalendarModal
          studentId={calendarStudent.id}
          studentName={`${calendarStudent.firstName} ${calendarStudent.lastName}`}
          onClose={() => setCalendarStudent(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransportPage() {
  const [tab, setTab] = useState<Tab>('routes');

  const TABS: [Tab, string][] = [
    ['routes',   'Routes'],
    ['vehicles', 'Vehicles'],
    ['drivers',  'Drivers'],
    ['fees',     'Daily Fees'],
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Transport</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage routes, vehicles, drivers, and daily fee collection.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-current' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            )}
            style={tab === key ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'routes'   && <RoutesTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'drivers'  && <DriversTab />}
      {tab === 'fees'     && <TransportFeesTab />}
    </div>
  );
}
