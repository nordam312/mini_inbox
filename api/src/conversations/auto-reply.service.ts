import { Inject, Injectable, Logger } from '@nestjs/common';

import { LLM, LlmProvider } from '../llm/llm.types';
import { ConversationsService } from './conversations.service';
import { buildSystemPrompt, toLlmMessages } from './prompt';

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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
