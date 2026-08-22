import { Global, Module } from '@nestjs/common';

import { TenantContext } from './tenant.context';
import { TenantGuard } from './tenant.guard';

// Global: tenant scoping is needed by every feature module.
@Global()
@Module({
  providers: [TenantGuard, TenantContext],
  exports: [TenantGuard, TenantContext],
})
export class TenantModule {}
