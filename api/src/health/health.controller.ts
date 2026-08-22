import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PublicRoute } from '../tenant/public-route.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Public: a health check that needs a tenant header is not a health check.
  @PublicRoute()
  @Get()
  async check(): Promise<{ status: string }> {
    // Round-trips to Postgres, so a broken connection fails the check rather
    // than reporting a healthy process that cannot serve a single request.
    await this.prisma.$queryRaw`SELECT 1`;

    return { status: 'ok' };
  }
}
