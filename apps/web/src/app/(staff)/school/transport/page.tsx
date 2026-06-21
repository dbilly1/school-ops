'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert, FormField, Input } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { PaymentsCalendarModal } from '@/components/fees/payments-calendar-modal';
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

type Tab = 'routes' | 'vehicles' | 'drivers' | 'fees';

// ── Assign students modal (searchable, multi-select) ───────────────────────────

function AssignStudentsModal({ route, students, open, onClose, onAssigned }: {
  route: Route;
  students: Student[];
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Reset state whenever the modal (re)opens.
  useEffect(() => {
    if (open) { setSearch(''); setSelected([]); setError(null); }
  }, [open]);

  const assignedIds = new Set(route.studentAssignments.map(a => a.student.id));
  const available   = students.filter(s => !assignedIds.has(s.id));

  const q = search.trim().toLowerCase();
  const filtered = available.filter(s =>
    !q || `${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase().includes(q),
  );

  const allVisibleSelected = filtered.length > 0 && filtered.every(s => selected.includes(s.id));

  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  function toggleAllVisible() {
    const visibleIds = filtered.map(s => s.id);
    setSelected(s => allVisibleSelected
      ? s.filter(id => !visibleIds.includes(id))
      : [...new Set([...s, ...visibleIds])]);
  }

  async function assign() {
    if (selected.length === 0) return;
    setSaving(true); setError(null);
    try {
      for (const studentId of selected) {
        await staffApi.post('/school/transport/assignments', { studentId, transportRouteId: route.id });
      }
      onAssigned(); onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to assign students.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Assign students — ${route.name}`}>
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or student ID…"
          autoFocus
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">
            {selected.length > 0 ? `${selected.length} selected` : `${available.length} available`}
          </span>
          {filtered.length > 0 && (
            <button type="button" onClick={toggleAllVisible} className="font-medium transition" style={{ color: 'var(--accent)' }}>
              {allVisibleSelected ? 'Clear visible' : 'Select all visible'}
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto -mx-1 px-1 divide-y divide-slate-50 border border-slate-100 rounded-lg">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              {available.length === 0 ? 'All students are already on this route.' : 'No students match your search.'}
            </p>
          ) : filtered.map(s => {
            const checked = selected.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="w-full flex items-center gap-3 px-2.5 py-2 text-left hover:bg-slate-50 transition"
              >
                <span
                  className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                  style={checked
                    ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' }
                    : { borderColor: '#cbd5e1' }}
                >
                  {checked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-slate-700 min-w-0 truncate">
                  {s.lastName}, {s.firstName}
                  <span className="ml-2 text-xs font-mono text-slate-400">{s.studentId}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <SaveButton
            loading={saving}
            onClick={assign}
            label={selected.length > 0 ? `Assign ${selected.length} student${selected.length !== 1 ? 's' : ''}` : 'Assign students'}
          />
        </div>
      </div>
    </Modal>
  );
}

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
  const [assignModalRoute, setAssignModalRoute] = useState<Route | null>(null);
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

  async function removeAssignment(studentId: string, studentName: string, routeName: string) {
    if (!confirm(`Remove ${studentName} from ${routeName}? Their daily transport fees will stop being tracked on this route.`)) return;
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

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {routes?.map(route => (
            <div key={route.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{route.name}</p>
                  <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 flex-wrap text-xs text-slate-500">
                    <span>GHS {route.dailyRate}/day</span>
                    {route.vehicle && <span>· {route.vehicle.plateNumber}</span>}
                    {route.driver  && <span>· {route.driver.name}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-50" style={{ color: 'var(--accent)' }}>
                  {route._count.studentAssignments}
                </span>
              </div>

              {/* Pickup points */}
              {route.pickupPoints.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {route.pickupPoints.sort((a,b) => a.order - b.order).map(p => (
                    <span key={p.id} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg">{p.name}</span>
                  ))}
                </div>
              )}

              {/* Assigned students */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {route.studentAssignments.length === 0 ? (
                  <span className="text-xs text-slate-300 italic">No students assigned</span>
                ) : route.studentAssignments.map(({ id, student }) => (
                  <div key={id} className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-lg text-xs text-slate-600">
                    <span>{student.lastName}, {student.firstName}</span>
                    <button
                      onClick={() => removeAssignment(student.id, `${student.firstName} ${student.lastName}`, route.name)}
                      disabled={removing === student.id}
                      className="text-slate-300 hover:text-red-400 transition disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Assign students */}
              <button
                onClick={() => setAssignModalRoute(route)}
                className="mt-auto text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                + Add students
              </button>
            </div>
          ))}

          {(!routes || routes.length === 0) && (
            <p className="col-span-3 text-sm text-slate-400 text-center py-12">No routes yet.</p>
          )}
        </div>
      )}

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

      {assignModalRoute && (
        <AssignStudentsModal
          route={assignModalRoute}
          students={students ?? []}
          open={!!assignModalRoute}
          onClose={() => setAssignModalRoute(null)}
          onAssigned={refetch}
        />
      )}
    </div>
  );
}

// ── Vehicles tab ──────────────────────────────────────────────────────────────

function VehiclesTab() {
  const [showNew, setShowNew] = useState(false);
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
      setShowNew(false); refetch();
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
      <div className="flex justify-end">
        <button onClick={() => { setError(null); setShowNew(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
          + Add vehicle
        </button>
      </div>

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

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add vehicle">
        <div className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Make" required><Input value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Toyota" /></FormField>
            <FormField label="Model" required><Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Hiace" /></FormField>
            <FormField label="Plate number" required><Input value={form.plateNumber} onChange={e => setForm(f => ({ ...f, plateNumber: e.target.value }))} placeholder="GR-1234-20" /></FormField>
            <FormField label="Capacity"><Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} /></FormField>
          </div>
          <div className="flex justify-end">
            <SaveButton loading={saving} onClick={create} label="Add vehicle" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Drivers tab ───────────────────────────────────────────────────────────────

function DriversTab() {
  const [showNew, setShowNew] = useState(false);
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
      setShowNew(false); refetch();
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
      <div className="flex justify-end">
        <button onClick={() => { setError(null); setShowNew(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
          + Add driver
        </button>
      </div>

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

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add driver">
        <div className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <FormField label="Full name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Driver name" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Phone"><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+233 20 000 0000" /></FormField>
            <FormField label="License number"><Input value={form.licenseNumber} onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))} placeholder="License #" /></FormField>
          </div>
          <div className="flex justify-end">
            <SaveButton loading={saving} onClick={create} label="Add driver" />
          </div>
        </div>
      </Modal>
    </div>
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
        <PaymentsCalendarModal
          basePath="/school/transport-fees"
          heading="Transport payments"
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
