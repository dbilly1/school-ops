'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert, FormField } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type Notice = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
};

type Tab = 'notices' | 'announcements';

// ── Compose modal ─────────────────────────────────────────────────────────────

function ComposeModal({ open, onClose, type, onCreated }: {
  open: boolean;
  onClose: () => void;
  type: Tab;
  onCreated: () => void;
}) {
  const [title, setTitle]     = useState('');
  const [body, setBody]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function create() {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.'); return;
    }
    setError(null); setSaving(true);
    try {
      const endpoint = type === 'notices'
        ? '/school/communication/notices'
        : '/school/communication/announcements';
      await staffApi.post(endpoint, { title: title.trim(), body: body.trim() });
      setTitle(''); setBody('');
      onCreated(); onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create.');
    } finally {
      setSaving(false);
    }
  }

  const label = type === 'notices' ? 'Notice' : 'Announcement';

  return (
    <Modal open={open} onClose={onClose} title={`New ${label}`} width="max-w-2xl">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <FormField label="Title" required>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={`${label} title…`}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
        </FormField>
        <FormField label="Body" required>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            placeholder="Write your message here…"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none resize-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition">
            Cancel
          </button>
          <SaveButton loading={saving} onClick={create} label={`Save as draft`} />
        </div>
      </div>
    </Modal>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ item, type, onAction }: {
  item: Notice | Announcement;
  type: Tab;
  onAction: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const isPublished = !!item.publishedAt;

  async function publish() {
    setPublishing(true);
    try {
      const endpoint = type === 'notices'
        ? `/school/communication/notices/${item.id}/publish`
        : `/school/communication/announcements/${item.id}/publish`;
      await staffApi.patch(endpoint);
      onAction();
    } finally {
      setPublishing(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this item?')) return;
    setDeleting(true);
    try {
      const endpoint = type === 'notices'
        ? `/school/communication/notices/${item.id}`
        : `/school/communication/announcements/${item.id}`;
      await staffApi.delete(endpoint);
      onAction();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isPublished ? 'border-slate-100' : 'border-amber-100'}`}>
      {/* Status banner for drafts */}
      {!isPublished && (
        <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
          <span className="text-xs font-semibold text-amber-600">Draft — not visible to students/parents yet</span>
        </div>
      )}

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{item.title}</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-3">{item.body}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">
          <div className="text-xs text-slate-400">
            By {item.author.firstName} {item.author.lastName} ·{' '}
            {isPublished
              ? `Published ${new Date(item.publishedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : `Created ${new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
          </div>

          <div className="flex items-center gap-3">
            {!isPublished && (
              <button
                onClick={publish}
                disabled={publishing}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
                onMouseEnter={e => !publishing && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
                onMouseLeave={e => !publishing && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
            {isPublished && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Published
              </span>
            )}
            <button
              onClick={remove}
              disabled={deleting}
              className="text-xs text-slate-300 hover:text-red-400 transition disabled:opacity-40"
            >
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────────

function PostList({ type }: { type: Tab }) {
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [showCompose, setShowCompose] = useState(false);

  const fetchItems = useCallback(() => {
    const endpoint = type === 'notices'
      ? '/school/communication/notices'
      : '/school/communication/announcements';
    return staffApi.get<(Notice | Announcement)[]>(endpoint);
  }, [type]);

  const { data: items, loading, refetch } = useApi(fetchItems);

  const filtered = items?.filter(item => {
    if (filter === 'published') return !!item.publishedAt;
    if (filter === 'draft')     return !item.publishedAt;
    return true;
  });

  const label = type === 'notices' ? 'Notice' : 'Announcement';

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(['all', 'published', 'draft'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1 rounded text-xs font-medium transition capitalize',
                filter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
        >
          + New {label}
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {filtered?.map(item => (
            <PostCard key={item.id} item={item} type={type} onAction={refetch} />
          ))}
          {(!filtered || filtered.length === 0) && (
            <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
              {filter === 'all' ? `No ${label.toLowerCase()}s yet.` : `No ${filter} ${label.toLowerCase()}s.`}
            </div>
          )}
        </div>
      )}

      <ComposeModal
        open={showCompose}
        onClose={() => setShowCompose(false)}
        type={type}
        onCreated={refetch}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunicationPage() {
  const [tab, setTab] = useState<Tab>('notices');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Communication</h1>
          <p className="text-sm text-slate-500 mt-0.5">Publish notices and announcements to students and parents.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {(['notices', 'announcements'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-5 py-1.5 rounded-lg text-sm font-medium transition capitalize',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {t}
          </button>
        ))}
      </div>

      <PostList type={tab} />
    </div>
  );
}
