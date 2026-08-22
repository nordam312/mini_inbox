import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { TenantRequest } from './tenant-request';

/**
 * The tenant this request belongs to, resolved and verified by TenantGuard.
 *
 * Repositories inject this instead of taking a tenantId argument: a caller
 * cannot pass the wrong tenant if it cannot pass one at all.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: TenantRequest) {}

  get tenantId(): string {
    const { tenantId } = this.request;

    if (!tenantId) {
      // Only reachable if a route escaped TenantGuard. Failing loudly here is
      // the point - the alternative is an unscoped query.
      throw new Error('TenantContext used on a request with no resolved tenant');
    }

    return tenantId;
  }
}
