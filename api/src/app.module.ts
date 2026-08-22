import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { HealthController } from './health/health.controller';
import { WebhookModule } from './webhook/webhook.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    WebhookModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global: routes are tenant-scoped unless they opt out with @PublicRoute().
    // Opting in per-controller would mean a forgotten decorator is an unscoped
    // endpoint; this way a forgotten decorator is a 401.
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
