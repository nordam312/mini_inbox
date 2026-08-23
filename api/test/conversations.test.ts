import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { AutoReplyService } from '../src/conversations/auto-reply.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import { StubLlm } from '../src/llm/stub.llm';
import { PrismaService } from '../src/prisma/prisma.service';
import { prismaClientOptions } from '../src/prisma/prisma.client';
import { TenantContext } from '../src/tenant/tenant.context';

/**
 * These run against the real database, because the logic worth testing here is
 * made of unique constraints and WHERE clauses. A mocked Prisma would assert
 * that the code calls the functions it calls, which is not the same as being
 * correct.
 *
 * Tenants are prefixed and deleted afterwards, so a run leaves nothing behind.
 */
const ACME = 'test-acme';
const RIVAL = 'test-rival';

const prisma = new PrismaClient(prismaClientOptions());

/** The service reads its tenant from a request-scoped context; this stands in. */
function servicesFor(tenantId: string) {
  const conversations = new ConversationsService(
    prisma as unknown as PrismaService,
    { tenantId } as TenantContext,
  );

  return {
    conversations,
    autoReply: new AutoReplyService(new StubLlm(), conversations),
  };
}

async function reset() {
  await prisma.tenant.deleteMany({ where: { id: { in: [ACME, RIVAL] } } });

  for (const id of [ACME, RIVAL]) {
    await prisma.tenant.create({
      data: { id, name: id, systemPrompt: `You are ${id}.` },
    });
  }
}

before(reset);

after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [ACME, RIVAL] } } });
  await prisma.$disconnect();
});

describe('inbound messages', () => {
  it('stores a redelivered message once', async () => {
    const { conversations } = servicesFor(ACME);
    const message = {
      externalId: 'redelivered',
      from: '+100',
      text: 'hello',
    };

    const first = await conversations.recordInboundMessage(message);
    const second = await conversations.recordInboundMessage(message);

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.messageId, first.messageId);

    const stored = await prisma.message.count({
      where: { tenantId: ACME, externalId: 'redelivered' },
    });
    assert.equal(stored, 1);
  });

  it('keeps one thread per sender, and separate threads per tenant', async () => {
    const acme = servicesFor(ACME).conversations;
    const rival = servicesFor(RIVAL).conversations;

    const first = await acme.recordInboundMessage({
      externalId: 'a1',
      from: '+shared',
      text: 'first',
    });
    const second = await acme.recordInboundMessage({
      externalId: 'a2',
      from: '+shared',
      text: 'second',
    });
    // Same phone number, different tenant.
    const other = await rival.recordInboundMessage({
      externalId: 'a1',
      from: '+shared',
      text: 'first',
    });

    assert.equal(second.conversationId, first.conversationId);
    assert.notEqual(other.conversationId, first.conversationId);
  });
});

describe('tenant isolation', () => {
  it('hides another tenant\'s conversation and refuses to write to it', async () => {
    const acme = servicesFor(ACME).conversations;
    const rival = servicesFor(RIVAL).conversations;

    const { conversationId } = await acme.recordInboundMessage({
      externalId: 'private',
      from: '+200',
      text: 'ours',
    });

    await assert.rejects(() => rival.getConversation(conversationId));
    await assert.rejects(() => rival.takeOver(conversationId));
    await assert.rejects(() => rival.addOperatorReply(conversationId, 'injected'));
    assert.equal(await rival.loadReplyContext(conversationId), null);

    const leaked = await prisma.message.count({
      where: { conversationId, tenantId: RIVAL },
    });
    assert.equal(leaked, 0);
  });
});

describe('operator takeover', () => {
  it('stays silent after takeover and resumes only on the next message', async () => {
    const { conversations, autoReply } = servicesFor(ACME);

    const opened = await conversations.recordInboundMessage({
      externalId: 't1',
      from: '+300',
      text: 'first question',
    });
    await autoReply.replyIfEnabled(opened.conversationId);

    const countAi = () =>
      prisma.message.count({
        where: { conversationId: opened.conversationId, role: 'AI' },
      });

    assert.equal(await countAi(), 1, 'the AI answers while it is enabled');

    await conversations.takeOver(opened.conversationId);
    await conversations.recordInboundMessage({
      externalId: 't2',
      from: '+300',
      text: 'second question',
    });
    await autoReply.replyIfEnabled(opened.conversationId);

    assert.equal(await countAi(), 1, 'the AI does not answer over an operator');

    // Handing back must not answer the message already waiting: the operator
    // may have handled it by phone, and cannot unsend an AI reply.
    await conversations.handBack(opened.conversationId);

    assert.equal(await countAi(), 1, 'handing back does not answer the backlog');

    await conversations.recordInboundMessage({
      externalId: 't3',
      from: '+300',
      text: 'third question',
    });
    await autoReply.replyIfEnabled(opened.conversationId);

    assert.equal(await countAi(), 2, 'the AI resumes on the next message');
  });
});
