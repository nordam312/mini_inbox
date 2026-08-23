const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'alsalam-motors';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type MessageRole = 'CUSTOMER' | 'AI' | 'OPERATOR';

export interface ConversationSummary {
  id: string;
  customerHandle: string;
  aiEnabled: boolean;
  lastMessageAt: string;
  lastMessage: { role: MessageRole; text: string } | null;
}

export interface ConversationDetail {
  id: string;
  customerHandle: string;
  aiEnabled: boolean;
  createdAt: string;
  messages: { id: string; role: MessageRole; text: string; createdAt: string }[];
}

/**
 * Every call to the API goes through here, so the tenant header is attached in
 * exactly one place. Runs on the server only - the browser never sees the API.
 */
async function request<T>(
  tenantId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'x-tenant-id': tenantId,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    // An inbox is stale the moment it is cached.
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(
      `${init.method ?? 'GET'} ${API_URL}${path} returned ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export function listConversations(tenantId: string): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>(tenantId, '/conversations');
}

export async function getConversation(
  tenantId: string,
  id: string,
): Promise<ConversationDetail | null> {
  try {
    return await request<ConversationDetail>(tenantId, `/conversations/${id}`);
  } catch (error) {
    // A 404 means the conversation belongs to another tenant, or the tenant was
    // switched while one was open. Anything else is a real failure worth showing.
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export function takeOverConversation(tenantId: string, id: string): Promise<unknown> {
  return request(tenantId, `/conversations/${id}/takeover`, { method: 'POST' });
}

export function sendOperatorReply(
  tenantId: string,
  id: string,
  text: string,
): Promise<unknown> {
  return request(tenantId, `/conversations/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
