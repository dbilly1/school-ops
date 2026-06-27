'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Render server-stored lesson-note HTML. The API already sanitizes on save; we
// sanitize again here so a hostile value can never reach the DOM, regardless of
// how it got into the database. Tags/attrs mirror the API allowlist.
const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote', 'hr', 'a',
];
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

export function RichTextView({ html, className }: { html?: string; className?: string }) {
  const clean = useMemo(() => {
    if (!html) return '';
    // DOMPurify needs a DOM; on the server fall back to empty (these only render
    // after a client-side fetch anyway).
    if (typeof window === 'undefined') return '';
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  }, [html]);

  if (!clean) return <p className="text-sm text-slate-400 italic">No content.</p>;
  return (
    <div
      className={`prose-lesson-note text-sm text-slate-700 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
