import { replyAction } from '../actions';

interface MessageComposerProps {
  tenantId: string;
  conversationId: string;
}

/**
 * A plain form posting to a server action, so replying works with no client
 * JavaScript. Sending does not disable the AI - taking over is separate.
 */
export function MessageComposer({ tenantId, conversationId }: MessageComposerProps) {
  return (
    <form className="composer" action={replyAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea
        name="text"
        rows={2}
        dir="auto"
        placeholder="Reply as an operator..."
      />
      <button className="primary" type="submit">
        Send
      </button>
    </form>
  );
}
