'use client';

import { useEffect, useRef } from 'react';

// A deliberately lightweight rich-text editor built on contentEditable +
// execCommand — bold/italic/underline/strike, headings, lists, quotes and
// links. No heavy editor dependency. The DOM is the source of truth: we seed it
// once on mount and emit HTML on input, so the caret never jumps. The API
// sanitizes the HTML on save, so anything execCommand produces is safe to store.

type Cmd = { icon: React.ReactNode; title: string; run: () => void };

export function RichTextEditor({
  initialHtml,
  onChange,
  disabled,
  placeholder = 'Write the lesson note…',
}: {
  initialHtml?: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed content once. We never write `initialHtml` back after mount, which is
  // what keeps the cursor stable while typing.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  const exec = (command: string, value?: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, value);
    emit();
  };

  const toggleBlock = (tag: string) => {
    // execCommand toggles to the tag; running it again with the same tag does
    // not revert, so we detect the current block and fall back to <p>.
    const sel = window.getSelection();
    const node = sel?.anchorNode as HTMLElement | null;
    const current = node?.parentElement?.closest(tag)?.tagName?.toLowerCase();
    exec('formatBlock', current === tag ? 'p' : tag);
  };

  const addLink = () => {
    const url = window.prompt('Link URL');
    if (url) exec('createLink', url);
  };

  const cmds: Cmd[] = [
    { icon: <b>B</b>,            title: 'Bold',          run: () => exec('bold') },
    { icon: <i>I</i>,           title: 'Italic',        run: () => exec('italic') },
    { icon: <u>U</u>,           title: 'Underline',     run: () => exec('underline') },
    { icon: <s>S</s>,           title: 'Strikethrough', run: () => exec('strikeThrough') },
    { icon: <span>H2</span>,    title: 'Heading',       run: () => toggleBlock('h2') },
    { icon: <span>H3</span>,    title: 'Subheading',    run: () => toggleBlock('h3') },
    { icon: <span>• List</span>, title: 'Bullet list',  run: () => exec('insertUnorderedList') },
    { icon: <span>1. List</span>, title: 'Numbered list', run: () => exec('insertOrderedList') },
    { icon: <span>❝</span>,     title: 'Quote',         run: () => toggleBlock('blockquote') },
    { icon: <span>🔗</span>,    title: 'Link',          run: addLink },
    { icon: <span>⨯</span>,     title: 'Clear formatting', run: () => exec('removeFormat') },
  ];

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:border-slate-300">
      {!disabled && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
          {cmds.map((c, i) => (
            <button
              key={i}
              type="button"
              title={c.title}
              // mousedown + preventDefault keeps the text selection intact.
              onMouseDown={e => { e.preventDefault(); c.run(); }}
              className="px-2 py-1 rounded text-xs text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition min-w-[28px]"
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholder}
        className={`rte-content min-h-[220px] px-3.5 py-3 text-sm text-slate-700 outline-none ${
          disabled ? 'bg-slate-50' : 'bg-white'
        }`}
      />
    </div>
  );
}
