import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { AutoReplyService } from './auto-reply.service';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [LlmModule],
  providers: [ConversationsService, AutoReplyService],
  exports: [ConversationsService, AutoReplyService],
})
export class ConversationsModule {}
