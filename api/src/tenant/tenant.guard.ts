import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_ROUTE } from './public-route.decorator';
import { TenantRequest } from './tenant-request';

/**
 * The single place a tenant is resolved. Registered globally, so every route
 * that is not explicitly public arrives at its handler with a verified tenant.
 *
 * The webhook carries its tenant in the path and the dashboard APIs carry it in
 * a header; both go through here rather than the webhook having its own path.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();

    // The webhook puts the tenant in the path, the dashboard APIs in a header.
    // Anything other than a plain string is treated as absent rather than
    // coerced - a repeated or array-valued parameter is not a tenant id.
    const pathTenantId = request.params?.tenantId;
    const tenantId =
      typeof pathTenantId === 'string'
        ? pathTenantId
        : request.header('x-tenant-id');

    if (!tenantId) {
      throw new UnauthorizedException('Unknown or missing tenant');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      // Same message as a missing tenant on purpose: the API should not tell a
      // caller which tenant ids exist.
      throw new UnauthorizedException('Unknown or missing tenant');
    }

    request.tenantId = tenant.id;

    return true;
  }
}
