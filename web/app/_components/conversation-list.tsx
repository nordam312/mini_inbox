import Link from 'next/link';

import type { ConversationSummary } from '@/lib/api';
import { dashboardHref } from '@/lib/utils';
import { refreshAction } from '../actions';

interface ConversationListProps {
  tenantId: string;
  conversations: ConversationSummary[];
  selectedId?: string;
  loadError: string | null;
}

export function ConversationList({
  tenantId,
  conversations,
  selectedId,
  loadError,
}: ConversationListProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <strong>Conversations</strong>
        <form action={refreshAction}>
          <button type="submit">Refresh</button>
        </form>
      </div>

      <TenantSwitcher tenantId={tenantId} />

      <div className="scroll">
        {loadError && <p className="empty error">{loadError}</p>}

        {!loadError && conversations.length === 0 && (
          <p className="empty">
            No conversations yet. Post a message to the webhook to start one.
          </p>
        )}

        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            tenantId={tenantId}
            conversation={conversation}
            selected={conversation.id === selectedId}
          />
        ))}
      </div>
    </section>
  );
}


// ملاحظة مهمة هذه فقط عشان تجربة باقي ال tenant 
/**
 * There is no auth to derive the tenant from, so it is a plain GET form that
 * puts the tenant in the URL. Switching tenants is a page navigation.
 */
function TenantSwitcher({ tenantId }: { tenantId: string }) {
  return (
    <form className="panel-head" method="get">
      <input type="text" name="tenant" defaultValue={tenantId} aria-label="Tenant id" />
      <button type="submit">Switch</button>
    </form>
  );
}

interface ConversationListItemProps {
  tenantId: string;
  conversation: ConversationSummary;
  selected: boolean;
}

function ConversationListItem({
  tenantId,
  conversation,
  selected,
}: ConversationListItemProps) {
  const { lastMessage } = conversation;

  return (
    <Link
      className={`conversation${selected ? ' selected' : ''}`}
      href={dashboardHref(tenantId, conversation.id)}
    >
      <div className="panel-head" style={{ padding: 0, border: 'none' }}>
        <span className="handle">{conversation.customerHandle}</span>
        {!conversation.aiEnabled && <span className="badge operator">operator</span>}
      </div>
      <div className="preview">
        {lastMessage
          ? `${lastMessage.role.toLowerCase()}: ${lastMessage.text}`
          : 'No messages'}
      </div>
    </Link>
  );
}
