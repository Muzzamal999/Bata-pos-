import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../audit/audit.service';
import { AuditMeta, AUDIT_KEY } from '../decorators/audited.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

/**
 * Runs on every request but only acts on handlers carrying @Audited metadata.
 * Writes happen after a successful response and are fire-and-forget: a
 * logging failure must never fail the request it's describing.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    return next.handle().pipe(
      tap((response: unknown) => {
        const entityId = this.extractEntityId(response, request.params);
        const metadata = {
          params: request.params,
          body: this.sanitize(request.body),
        };

        this.auditService
          .log({
            tenantId: user?.tenantId ?? null,
            actorUserId: user?.userId ?? null,
            action: meta.action,
            entityType: meta.entityType,
            entityId,
            metadata,
          })
          .catch((error) => this.logger.error('Failed to write audit log entry', error));
      }),
    );
  }

  private extractEntityId(
    response: unknown,
    params: Record<string, string> | undefined,
  ): string | null {
    if (response && typeof response === 'object' && 'id' in response) {
      const id = (response as { id?: unknown }).id;
      if (typeof id === 'string') return id;
    }
    return params?.id ?? null;
  }

  private sanitize(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return body;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = body as Record<string, unknown>;
    return rest;
  }
}
