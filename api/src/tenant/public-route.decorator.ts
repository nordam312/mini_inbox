import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'publicRoute';

/** Opts a route out of tenant resolution. Only /health uses this. */
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);
