import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageRole } from '@prisma/client';

import { LLM, LlmMessage, LlmProvider } from '../llm/llm.types';
import { ConversationsService, ReplyContext } from './conversations.service';

@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  constructor(
    @Inject(LLM) private readonly llm: LlmProvider,
    private readonly conversations: ConversationsService,
  ) {}

  async replyIfEnabled(conversationId: string): Promise<void> {
    try {
      await this.reply(conversationId);
    } catch (error) {
      this.logger.error(
        `Auto-reply failed for conversation ${conversationId}: ${describe(error)}`,
      );
    }
  }

  private async reply(conversationId: string): Promise<void> {
    const context = await this.conversations.loadReplyContext(conversationId);

    if (!context) {
      return;
    }

    if (!context.aiEnabled) {
      this.logger.log(`Conversation ${conversationId} is handled by an operator`);
      return;
    }

    const reply = await this.llm.complete({
      system: buildSystemPrompt(context),
      messages: toLlmMessages(context.messages),
    });

    if (reply.length === 0) {
      this.logger.warn(`Auto-reply for conversation ${conversationId} was empty`);
      return;
    }

    await this.conversations.appendAiMessage(conversationId, reply);
  }
}



/**
 * The tenant's persona plus its knowledge base. This is the one place where a
 * mis-scoped read would leak one tenant's data into another tenant's reply, so
 * it is built only from a ReplyContext that came back tenant-scoped.
 */
function buildSystemPrompt(context: ReplyContext): string {
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

function toLlmMessages(
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
