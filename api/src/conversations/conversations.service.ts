import { Injectable, Logger } from '@nestjs/common';
import { MessageRole, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.context';
import { InboundMessageDto } from '../webhook/dto/inbound-message.dto';

/** How many past turns the model is shown. Enough for context, bounded cost. */
const HISTORY_LIMIT = 20;

/** Everything the AI needs to answer, read in one tenant-scoped query. */
export interface ReplyContext {
  aiEnabled: boolean;
  systemPrompt: string;
  knowledge: { title: string; content: string }[];
  messages: { role: MessageRole; text: string }[];
}

export interface RecordedMessage {
  conversationId: string;
  messageId: string;
  /** True when this externalId had already been stored. */
  duplicate: boolean;
}

/**
 * All access to the tenant-owned tables lives here, and every query scopes by
 * `this.tenant.tenantId`. One file to audit for cross-tenant leakage.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async recordInboundMessage(input: InboundMessageDto): Promise<RecordedMessage> {
    const stored = await this.findByExternalId(input.externalId);

    if (stored) {
      // Providers retry when our response is slow or lost. Storing the message
      // twice would show the customer's question twice in the dashboard.
      this.logger.log(`Ignoring redelivery of message ${input.externalId}`);
      return stored;
    }

    try {
      return await this.persist(input);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // Something raced us. If it was the same message arriving twice at once,
      // the winner has stored it and we report a duplicate.
      const winner = await this.findByExternalId(input.externalId);

      if (winner) {
        return winner;
      }

      // Otherwise two different messages from the same new customer raced to
      // create the customer or conversation row. The rows exist now, so the
      // loser succeeds on a second attempt.
      return this.persist(input);
    }
  }

  /**
   * Returns null when the conversation does not belong to the calling tenant,
   * which is deliberately the same answer as "does not exist".
   */
  async loadReplyContext(conversationId: string): Promise<ReplyContext | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: this.tenant.tenantId },
      select: {
        aiEnabled: true,
        tenant: {
          select: {
            systemPrompt: true,
            knowledge: {
              select: { title: true, content: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        messages: {
          select: { role: true, text: true },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_LIMIT,
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return {
      aiEnabled: conversation.aiEnabled,
      systemPrompt: conversation.tenant.systemPrompt,
      knowledge: conversation.tenant.knowledge,
      // Read newest-first so the limit keeps the most recent turns, then
      // flipped back into chronological order for the model.
      messages: conversation.messages.reverse(),
    };
  }

  async appendAiMessage(conversationId: string, text: string): Promise<void> {
    const tenantId = this.tenant.tenantId;

    await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { tenantId, conversationId, role: MessageRole.AI, text },
        select: { createdAt: true },
      });

      // updateMany so tenantId is part of the write itself, rather than merely
      // implied by the caller having read the conversation earlier.
      await tx.conversation.updateMany({
        where: { id: conversationId, tenantId },
        data: { lastMessageAt: message.createdAt },
      });
    });
  }

  private async findByExternalId(
    externalId: string,
  ): Promise<RecordedMessage | null> {
    const message = await this.prisma.message.findUnique({
      where: {
        tenantId_externalId: { tenantId: this.tenant.tenantId, externalId },
      },
      select: { id: true, conversationId: true },
    });

    if (!message) {
      return null;
    }

    return {
      conversationId: message.conversationId,
      messageId: message.id,
      duplicate: true,
    };
  }

  private async persist(input: InboundMessageDto): Promise<RecordedMessage> {
    const tenantId = this.tenant.tenantId;

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { tenantId_handle: { tenantId, handle: input.from } },
        create: { tenantId, handle: input.from },
        update: {},
        select: { id: true },
      });

      // Same sender, same tenant, same thread.
      const conversation = await tx.conversation.upsert({
        where: { customerId: customer.id },
        create: { tenantId, customerId: customer.id },
        update: {},
        select: { id: true },
      });

      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          role: MessageRole.CUSTOMER,
          text: input.text,
          externalId: input.externalId,
        },
        select: { id: true, createdAt: true },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: message.createdAt },
      });

      return {
        conversationId: conversation.id,
        messageId: message.id,
        duplicate: false,
      };
    });
  }
}








function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}
