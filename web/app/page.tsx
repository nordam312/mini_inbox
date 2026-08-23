import {
  ConversationSummary,
  DEFAULT_TENANT_ID,
  getConversation,
  listConversations,
} from '@/lib/api';
import { explainApiError } from '@/lib/utils';
import { ConversationList } from './_components/conversation-list';
import { ConversationThread } from './_components/conversation-thread';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tenant?: string; conversation?: string }>;
}

/**
 * Reads the tenant and selected thread from the URL, fetches both panels, and
 * assembles the layout. All rendering lives in _components.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tenantId = params.tenant ?? DEFAULT_TENANT_ID;

  let conversations: ConversationSummary[] = [];
  let loadError: string | null = null;

  try {
    conversations = await listConversations(tenantId);
  } catch (error) {
    loadError = explainApiError(error, tenantId);
  }

  const selectedId = params.conversation ?? conversations[0]?.id;
  const selected =
    selectedId && !loadError ? await getConversation(tenantId, selectedId) : null;

  return (
    <main className="layout">
      <ConversationList
        tenantId={tenantId}
        conversations={conversations}
        selectedId={selectedId}
        loadError={loadError}
      />

      <section className="panel">
        {loadError ? (
          <p className="empty error">{loadError}</p>
        ) : selected ? (
          <ConversationThread tenantId={tenantId} conversation={selected} />
        ) : (
          <p className="empty">Select a conversation.</p>
        )}
      </section>
    </main>
  );
}
