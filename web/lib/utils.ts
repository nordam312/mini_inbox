import { ApiError } from "./api";

export function explainApiError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "You do not have access to this workspace or resource.";
  }

  if (error instanceof ApiError && error.status === 404) {
    return "The requested resource was not found.";
  }

  const detail = error instanceof Error ? error.message : String(error);

  return `Could not reach the API. Is it running, and is API_URL correct? (${detail})`;
}

/**
 * Codes rather than messages, because the value ends up in the URL. Putting the
 * text there would let anyone craft a link that shows arbitrary copy in the
 * dashboard.
 */
export type ActionErrorCode = "unreachable" | "not-found" | "denied" | "failed";

export function actionErrorCode(error: unknown): ActionErrorCode {
  if (error instanceof ApiError && error.status === 401) {
    return "denied";
  }

  if (error instanceof ApiError && error.status === 404) {
    return "not-found";
  }

  return error instanceof ApiError ? "failed" : "unreachable";
}

const ACTION_ERROR_MESSAGES: Record<ActionErrorCode, string> = {
  unreachable: "Could not reach the API. The action was not applied.",
  "not-found": "That conversation no longer exists.",
  denied: "You do not have access to this workspace or resource.",
  failed: "The action could not be completed. Please try again.",
};

/** Returns null for anything that is not a code we issued. */
export function actionErrorMessage(code: string | undefined): string | null {
  if (!code) {
    return null;
  }

  return ACTION_ERROR_MESSAGES[code as ActionErrorCode] ?? null;
}

/**
 * Builds the dashboard URL. Actions redirect back through here, so a failure
 * survives the redirect with no client-side state.
 */
export function dashboardHref(
  tenantId: string,
  conversationId?: string,
  error?: ActionErrorCode,
): string {
  const params = new URLSearchParams({ tenant: tenantId });

  if (conversationId) {
    params.set("conversation", conversationId);
  }

  if (error) {
    params.set("error", error);
  }

  return `/?${params.toString()}`;
}
