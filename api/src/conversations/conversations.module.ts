import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { AutoReplyService } from './auto-reply.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [LlmModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, AutoReplyService],
  exports: [ConversationsService, AutoReplyService],
})
export class ConversationsModule {}
