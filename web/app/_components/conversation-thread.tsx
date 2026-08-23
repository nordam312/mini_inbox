import type { ConversationDetail, MessageRole } from '@/lib/api';
import { handBackAction, takeOverAction } from '../actions';
import { MessageComposer } from './message-composer';

interface ConversationThreadProps {
  tenantId: string;
  conversation: ConversationDetail;
}

export function ConversationThread({
  tenantId,
  conversation,
}: ConversationThreadProps) {
  return (
    <>
      <div className="panel-head">
        <strong>{conversation.customerHandle}</strong>
        <div className="toolbar">
          <span className="badge">
            {conversation.aiEnabled ? 'AI replying' : 'operator handling'}
          </span>
          <AiStateButton
            tenantId={tenantId}
            conversationId={conversation.id}
            aiEnabled={conversation.aiEnabled}
          />
        </div>
      </div>

      <div className="scroll">
        {conversation.messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            text={message.text}
            createdAt={message.createdAt}
          />
        ))}
      </div>

      <MessageComposer tenantId={tenantId} conversationId={conversation.id} />
    </>
  );
}

interface AiStateButtonProps {
  tenantId: string;
  conversationId: string;
  aiEnabled: boolean;
}

/**
 * Takeover and hand back are separate endpoints rather than a toggle, so the
 * button says what will happen rather than what the state currently is.
 */
function AiStateButton({ tenantId, conversationId, aiEnabled }: AiStateButtonProps) {
  return (
    <form action={aiEnabled ? takeOverAction : handBackAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <button type="submit">{aiEnabled ? 'Take over' : 'Hand back to AI'}</button>
    </form>
  );
}

interface MessageBubbleProps {
  role: MessageRole;
  text: string;
  createdAt: string;
}

function MessageBubble({ role, text, createdAt }: MessageBubbleProps) {
  return (
    <div className={`message ${role}`}>
      <div className="message-meta">
        {role.toLowerCase()} · {new Date(createdAt).toLocaleString()}
      </div>
      {text}
    </div>
  );
}
