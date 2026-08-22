import { Module } from '@nestjs/common';

import { ConversationsModule } from '../conversations/conversations.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [ConversationsModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
