import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { ConversationsService, RecordedMessage } from '../conversations/conversations.service';
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
  constructor(private readonly conversations: ConversationsService) {}

  @Post('message')
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Body() dto: InboundMessageDto): Promise<RecordedMessage> {
    return this.conversations.recordInboundMessage(dto);
  }
}
