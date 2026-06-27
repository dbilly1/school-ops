import { BadRequestException } from '@nestjs/common';
import { LessonNoteFormatPolicy, Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';

// A lesson note's `content` JSON is one of two shapes:
//   • structured — the GES template fields (strand, lessons[], …). This is the
//     legacy/default shape and carries no `format` discriminator.
//   • rich       — { format: 'RICH', html: string }, a single free-form body.
// The school's LessonNoteFormatPolicy decides which shapes are allowed.

export const RICH = 'RICH' as const;

function isRich(content: any): boolean {
  return !!content && typeof content === 'object' && content.format === RICH;
}

// Allowlist tuned to the lightweight built-in editor (bold/italic/underline/
// strike, headings, lists, links, blockquotes). Anything else — scripts, event
// handlers, styles, iframes — is stripped. Authoritative server-side scrub run
// on every save; the client sanitizes again on render for defence in depth.
const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'span', 'div',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'blockquote', 'hr', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Force links to open safely and never leak the referrer / window.opener.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
  disallowedTagsMode: 'discard',
};

/**
 * Validate `content` against the school's policy and sanitize any rich HTML.
 * Returns the value to persist. Throws BadRequest when the shape is not allowed
 * by the policy (e.g. a rich body while the school is STRUCTURED_ONLY).
 */
export function prepareLessonNoteContent(
  content: any,
  policy: LessonNoteFormatPolicy,
): Prisma.InputJsonValue {
  const rich = isRich(content);

  if (rich && policy === LessonNoteFormatPolicy.STRUCTURED_ONLY) {
    throw new BadRequestException('Rich-text lesson notes are not enabled for this school.');
  }
  if (!rich && policy === LessonNoteFormatPolicy.RICH_ONLY) {
    throw new BadRequestException('This school requires rich-text lesson notes.');
  }

  if (rich) {
    const html = typeof content.html === 'string' ? sanitizeHtml(content.html, SANITIZE_OPTS) : '';
    return { format: RICH, html } as Prisma.InputJsonValue;
  }

  // Structured content is an opaque object; persist as-is (the frontend owns the
  // field layout). Default to an empty object when nothing was supplied.
  return (content ?? {}) as Prisma.InputJsonValue;
}
