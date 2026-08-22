import { Injectable, Logger } from '@nestjs/common';
import { MessageRole, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.context';
import { InboundMessageDto } from '../webhook/dto/inbound-message.dto';

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
