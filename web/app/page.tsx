import {
  ConversationSummary,
  DEFAULT_TENANT_ID,
  getConversation,
  listConversations,
} from '@/lib/api';
import { actionErrorMessage, explainApiError } from '@/lib/utils';
import { ConversationList } from './_components/conversation-list';
import { ConversationThread } from './_components/conversation-thread';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tenant?: string; conversation?: string; error?: string }>;
}

/**
 * Reads the tenant and selected thread from the URL, fetches both panels, and
 * assembles the layout. All rendering lives in _components.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tenantId = params.tenant ?? DEFAULT_TENANT_ID;

  let conversations: ConversationSummary[] = [];
  let selected = null;
  let loadError: string | null = null;
  let selectedId: string | undefined;

  // Both reads are in one try: the API can just as easily fail on the second
  // call as the first, and neither should take the page down.
  try {
    conversations = await listConversations(tenantId);
    selectedId = params.conversation ?? conversations[0]?.id;
    selected = selectedId ? await getConversation(tenantId, selectedId) : null;
  } catch (error) {
    loadError = explainApiError(error);
  }

  // Set by a failed takeover, handback or reply, which redirect back here.
  const actionError = actionErrorMessage(params.error);

  return (
    <main className="layout">
      <ConversationList
        tenantId={tenantId}
        conversations={conversations}
        selectedId={selectedId}
        loadError={loadError}
      />

      <section className="panel">
        {actionError && <p className="empty error">{actionError}</p>}

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
