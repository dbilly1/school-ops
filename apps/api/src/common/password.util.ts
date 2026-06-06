import { randomInt } from 'crypto';

// Excludes ambiguous characters (0/O, 1/I/l) so temp passwords are easy to read aloud/type.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generate a temporary password using a cryptographically secure RNG
 * (`crypto.randomInt`), not `Math.random()` which is predictable (security
 * review M4).
 */
export function generateTempPassword(length = 10): string {
  return Array.from({ length }, () => CHARS[randomInt(CHARS.length)]).join('');
}
