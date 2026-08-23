import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import {
  ConversationAiState,
  ConversationDetail,
  ConversationsService,
  ConversationSummary,
} from './conversations.service';
import { OperatorReplyDto } from './dto/operator-reply.dto';

/**
 * The dashboard's API. Every route is scoped to the tenant in the x-tenant-id
 * header by TenantGuard; nothing here reads a tenant id, so no handler can
 * widen its own scope.
 *
 * A conversation belonging to another tenant is reported as 404 rather than
 * 403 - the caller learns nothing about ids it does not own.
 */
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(): Promise<ConversationSummary[]> {
    return this.conversations.listConversations();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ConversationDetail> {
    return this.conversations.getConversation(id);
  }

  @Post(':id/takeover')
  @HttpCode(HttpStatus.OK)
  takeOver(@Param('id') id: string): Promise<ConversationAiState> {
    return this.conversations.takeOver(id);
  }

  @Post(':id/handback')
  @HttpCode(HttpStatus.OK)
  handBack(@Param('id') id: string): Promise<ConversationAiState> {
    return this.conversations.handBack(id);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  reply(
    @Param('id') id: string,
    @Body() dto: OperatorReplyDto,
  ): Promise<{ messageId: string }> {
    return this.conversations.addOperatorReply(id, dto.text);
  }
}
