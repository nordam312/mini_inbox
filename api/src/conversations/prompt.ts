import { MessageRole } from '@prisma/client';

import { LlmMessage } from '../llm/llm.types';
import { ReplyContext } from './conversations.service';

/**
 * Turns a tenant-scoped ReplyContext into a prompt.
 *
 * This is the one place where a mis-scoped read would leak one tenant's data
 * into another tenant's reply - not through an API response, but through the
 * model's answer, where no HTTP-layer guard would catch it. It is deliberately
 * pure and takes no database access of its own: everything it can see arrived
 * already scoped.
 */
export function buildSystemPrompt(context: ReplyContext): string {
  if (context.knowledge.length === 0) {
    return context.systemPrompt;
  }

  const entries = context.knowledge
    .map((entry) => `## ${entry.title}\n${entry.content}`)
    .join('\n\n');

  return [
    context.systemPrompt,
    '',
    '# Knowledge base',
    'Answer only from the information below. If it does not cover the question,',
    'say you will check and come back to them.',
    '',
    entries,
  ].join('\n');
}

export function toLlmMessages(
  messages: { role: MessageRole; text: string }[],
): LlmMessage[] {
  const mapped: LlmMessage[] = messages.map((message) => ({
    role: message.role === MessageRole.CUSTOMER ? 'user' : 'assistant',
    text: message.text,
  }));

  // A history window can begin mid-thread on an assistant turn; providers
  // expect the conversation to open with the customer.
  const firstCustomerTurn = mapped.findIndex((message) => message.role === 'user');

  return firstCustomerTurn === -1 ? [] : mapped.slice(firstCustomerTurn);
}
