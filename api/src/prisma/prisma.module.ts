import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

// Global so feature modules share one connection pool without re-importing.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
