'use client';

import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
};

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === overlayRef.current && onClose()}
    >
      <div className={`w-full ${width} max-h-[calc(100dvh-2rem)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col`}>
        {/* Header — stays pinned so the close button is always reachable */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition text-lg leading-none"
          >
            ×
          </button>
        </div>
        {/* Body — scrolls when content is taller than the viewport */}
        <div className="px-6 py-5 overflow-y-auto min-h-0 scrollbar-slim-light">{children}</div>
      </div>
    </div>
  );
}
