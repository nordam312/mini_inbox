import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { AutoReplyService } from '../conversations/auto-reply.service';
import {
  ConversationsService,
  RecordedMessage,
} from '../conversations/conversations.service';
import { InboundMessageDto } from './dto/inbound-message.dto';

/**
 * Stands in for a WhatsApp webhook.
 *
 * The :tenantId in the path is read by TenantGuard, not by this controller -
 * the handler never sees an unverified tenant id, and cannot accidentally use
 * one that was not checked.
 */
@Controller('webhook/:tenantId')
export class WebhookController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly autoReply: AutoReplyService,
  ) {}

  @Post('message')
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(@Body() dto: InboundMessageDto): Promise<RecordedMessage> {
    const recorded = await this.conversations.recordInboundMessage(dto);

    // Only a message we actually stored earns a reply; a redelivery must not
    // make the AI answer the same question twice.
    if (!recorded.duplicate) {
      // The model call happens inline, so the webhook response waits for it.
      // Fine at this size, wrong at volume - see the README.
      await this.autoReply.replyIfEnabled(recorded.conversationId);
    }

    return recorded;
  }
}
