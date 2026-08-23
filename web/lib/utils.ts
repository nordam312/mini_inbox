import { ApiError } from "./api";

export function explainApiError(error: unknown, tenantId: string): string {
  if (error instanceof ApiError && error.status === 401) {
    return "You do not have access to this workspace or resource.";
  }

  if (error instanceof ApiError && error.status === 404) {
    return "The requested resource was not found.";
  }

  const detail = error instanceof Error ? error.message : String(error);

  return `Could not reach the API. Is it running, and is API_URL correct? (${detail})`;
}

export function dashboardHref(
  tenantId: string,
  conversationId?: string,
): string {
  const params = new URLSearchParams({ tenant: tenantId });

  if (conversationId) {
    params.set("conversation", conversationId);
  }

  return `/?${params.toString()}`;
}
