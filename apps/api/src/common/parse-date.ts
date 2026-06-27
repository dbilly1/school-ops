/**
 * Parse a date string from a spreadsheet import. Tolerant of the formats schools
 * actually type, with Ghanaian day-first convention as the default for ambiguous
 * slash/dash dates.
 *
 * Returns:
 *   - a `Date` (UTC midnight) on success
 *   - `null` when the input is empty/whitespace (field simply omitted)
 *   - `'invalid'` when a non-empty value can't be understood
 *
 * The client already converts real Excel date cells to ISO `YYYY-MM-DD`, so the
 * common path here is ISO; the others cover hand-typed text.
 */
export function parseImportDate(raw: string | undefined | null): Date | null | 'invalid' {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD (optionally with a time component we ignore)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // Day-first slash/dash: DD/MM/YYYY or DD-MM-YYYY (also accepts 2-digit year)
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    let [, d, m, y] = dmy.map(Number) as unknown as [unknown, number, number, number];
    if (y < 100) y += y < 30 ? 2000 : 1900; // 2-digit year heuristic
    return build(y, m, d);
  }

  // Free text like "5 Jan 2015" / "January 5, 2015" — defer to the JS parser.
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  return 'invalid';
}

function build(year: number, month: number, day: number): Date | 'invalid' {
  if (month < 1 || month > 12 || day < 1 || day > 31) return 'invalid';
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject overflow (e.g. 31/02 rolling into March).
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'invalid';
  return date;
}
