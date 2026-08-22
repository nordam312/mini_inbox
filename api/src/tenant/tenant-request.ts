import type { Request } from 'express';

/**
 * The request as it exists after TenantGuard has run. `tenantId` is set only
 * once the tenant has been resolved and confirmed to exist.
 */
export interface TenantRequest extends Request {
  tenantId?: string;
}
