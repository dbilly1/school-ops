import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

// Thin wrapper over the Supabase Storage REST API (no SDK dependency — uses the
// global fetch). Private bucket; reads always go through short-lived signed URLs.
// Configured via env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CURRICULUM_BUCKET
// (default "curriculum"). When unset, isConfigured() is false and write/read
// throw a clear 503 — the rest of the app (e.g. pasted links) keeps working.
@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService');

  private get baseUrl(): string | undefined {
    return process.env.SUPABASE_URL?.replace(/\/+$/, '');
  }
  private get key(): string | undefined {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  private get bucket(): string {
    return process.env.CURRICULUM_BUCKET || 'curriculum';
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.key);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API.',
      );
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key as string, ...extra };
  }

  // Upload (upsert) raw bytes to `path` within the bucket.
  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    this.assertConfigured();
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${encodeURI(path)}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'true' }),
      // Buffer is a valid fetch body at runtime; the lib type is narrower.
      body: body as unknown as string,
    });
    if (!res.ok) {
      this.logger.error(`upload ${path} failed (${res.status}): ${await res.text().catch(() => '')}`);
      throw new ServiceUnavailableException('Could not upload the file to storage.');
    }
  }

  // A time-limited download URL for a private object.
  async signedUrl(path: string, expiresIn = 300): Promise<string> {
    this.assertConfigured();
    const res = await fetch(`${this.baseUrl}/storage/v1/object/sign/${this.bucket}/${encodeURI(path)}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) {
      this.logger.error(`sign ${path} failed (${res.status}): ${await res.text().catch(() => '')}`);
      throw new ServiceUnavailableException('Could not generate a download link.');
    }
    const data = (await res.json()) as { signedURL: string };
    // The API returns a path that may or may not include the /storage/v1 prefix.
    const rel = data.signedURL.replace(/^\/storage\/v1/, '');
    return `${this.baseUrl}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
  }

  // Best-effort delete — never throws (used during row cleanup).
  async remove(path: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${encodeURI(path)}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
    } catch (e) {
      this.logger.warn(`remove ${path} failed: ${(e as Error).message}`);
    }
  }
}
