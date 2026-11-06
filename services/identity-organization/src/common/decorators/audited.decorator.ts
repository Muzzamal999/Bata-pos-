import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string;
  entityType: string;
}

/** Marks a route as an administrative action worth recording in the audit log. */
export const Audited = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType });
