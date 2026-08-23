import type { ConversationDetail, MessageRole } from '@/lib/api';
import { takeOverAction } from '../actions';
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
          {conversation.aiEnabled && (
            <TakeOverButton tenantId={tenantId} conversationId={conversation.id} />
          )}
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

function TakeOverButton({
  tenantId,
  conversationId,
}: {
  tenantId: string;
  conversationId: string;
}) {
  return (
    <form action={takeOverAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <button type="submit">Take over</button>
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
