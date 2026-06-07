import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs how long each request spends inside the API (guards + controller + DB).
 * Diagnostic aid for the "platform is slow" investigation — compare this number
 * against the total time the browser sees for the same request: if the API time
 * is small but the browser time is large, the cost is network/frontend, not here.
 *
 * Enabled by default; set TIMING_LOG=off to silence.
 */
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Timing');
  private readonly enabled = process.env.TIMING_LOG !== 'off';
  private readonly slowMs = Number(process.env.TIMING_SLOW_MS ?? 300);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled) return next.handle();

    const req = context.switchToHttp().getRequest();
    const { method, originalUrl, url } = req;
    const path = originalUrl ?? url;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(method, path, start),
        error: () => this.log(method, path, start, true),
      }),
    );
  }

  private log(method: string, path: string, start: number, errored = false) {
    const ms = Date.now() - start;
    const msg = `${method} ${path} — ${ms}ms${errored ? ' (error)' : ''}`;
    if (ms >= this.slowMs) this.logger.warn(`SLOW ${msg}`);
    else this.logger.log(msg);
  }
}
