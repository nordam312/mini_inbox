import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MessageRole, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.context';
import { InboundMessageDto } from '../webhook/dto/inbound-message.dto';

/** How many past turns the model is shown. Enough for context, bounded cost. */
const HISTORY_LIMIT = 20;

/** Bounded by default: an inbox is browsed, not exported. */
const CONVERSATION_LIST_LIMIT = 50;
const THREAD_MESSAGE_LIMIT = 200;

export interface ConversationAiState {
  id: string;
  aiEnabled: boolean;
}

export interface ConversationSummary {
  id: string;
  customerHandle: string;
  aiEnabled: boolean;
  lastMessageAt: Date;
  lastMessage: { role: MessageRole; text: string } | null;
}

export interface ConversationDetail {
  id: string;
  customerHandle: string;
  aiEnabled: boolean;
  createdAt: Date;
  messages: { id: string; role: MessageRole; text: string; createdAt: Date }[];
}

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

  async listConversations(): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId: this.tenant.tenantId },
      orderBy: { lastMessageAt: 'desc' },
      take: CONVERSATION_LIST_LIMIT,
      select: {
        id: true,
        aiEnabled: true,
        lastMessageAt: true,
        customer: { select: { handle: true } },
        messages: {
          select: { role: true, text: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      customerHandle: conversation.customer.handle,
      aiEnabled: conversation.aiEnabled,
      lastMessageAt: conversation.lastMessageAt,
      lastMessage: conversation.messages[0] ?? null,
    }));
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: this.tenant.tenantId },
      select: {
        id: true,
        aiEnabled: true,
        createdAt: true,
        customer: { select: { handle: true } },
        messages: {
          select: { id: true, role: true, text: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: THREAD_MESSAGE_LIMIT,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      customerHandle: conversation.customer.handle,
      aiEnabled: conversation.aiEnabled,
      createdAt: conversation.createdAt,
      messages: conversation.messages.reverse(),
    };
  }

  /** An operator takes the thread. Idempotent. */
  async takeOver(conversationId: string): Promise<ConversationAiState> {
    return this.setAiEnabled(conversationId, false);
  }

  /**
   * The operator gives the thread back. Idempotent.
   *
   * The AI is not asked to answer the message that is already waiting - it
   * resumes on the next inbound one. Answering now would talk over an operator
   * who may have handled the question by phone.
   */
  async handBack(conversationId: string): Promise<ConversationAiState> {
    return this.setAiEnabled(conversationId, true);
  }

  private async setAiEnabled(
    conversationId: string,
    aiEnabled: boolean,
  ): Promise<ConversationAiState> {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId, tenantId: this.tenant.tenantId },
      data: { aiEnabled },
    });

    if (count === 0) {
      throw new NotFoundException('Conversation not found');
    }

    return { id: conversationId, aiEnabled };
  }

  /**
   * Sending a manual reply deliberately does NOT disable the AI. Taking over is
   * a separate, explicit action, so nothing about the conversation changes state
   * without the operator asking for it.
   */
  async addOperatorReply(
    conversationId: string,
    text: string,
  ): Promise<{ messageId: string }> {
    // appendMessage throws NotFoundException for a conversation this tenant
    // does not own, so there is no separate ownership check to keep in sync.
    const messageId = await this.appendMessage(
      conversationId,
      MessageRole.OPERATOR,
      text,
    );

    return { messageId };
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
    await this.appendMessage(conversationId, MessageRole.AI, text);
  }

  /**
   * The single write path for AI and operator messages.
   *
   * The tenant-scoped update runs FIRST and must match a row. That makes the
   * ownership check part of the write rather than something each caller is
   * trusted to have done, so a conversationId belonging to another tenant can
   * never have a message attached to it.
   */
  private async appendMessage(
    conversationId: string,
    role: MessageRole,
    text: string,
  ): Promise<string> {
    const tenantId = this.tenant.tenantId;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.conversation.updateMany({
        where: { id: conversationId, tenantId },
        data: { lastMessageAt: now },
      });

      if (count === 0) {
        throw new NotFoundException('Conversation not found');
      }

      const message = await tx.message.create({
        // createdAt is set explicitly so it matches lastMessageAt exactly.
        data: { tenantId, conversationId, role, text, createdAt: now },
        select: { id: true },
      });

      return message.id;
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
