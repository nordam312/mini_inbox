import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import { prismaClientOptions } from '../src/prisma/prisma.client';

/**
 * Two tenants with deliberately different personas and knowledge bases, so the
 * same question sent to each produces visibly different answers.
 *
 * The ids are fixed and readable because they are typed by hand into the
 * requests/*.http files and into curl commands in the README.
 */
const TENANTS = [
  {
    id: 'alsalam-motors',
    name: 'Al Salam Motors',
    systemPrompt: [
      'You are the sales assistant for Al Salam Motors, a used car dealership in Riyadh.',
      'Reply in the language the customer used. Arabic customers get Arabic.',
      'Be brief and practical. Quote prices only from the knowledge base.',
      'If a customer wants to see a car, offer to book a viewing.',
    ].join(' '),
    knowledge: [
      {
        title: 'Opening hours',
        content: 'Saturday to Thursday, 9am to 9pm. Closed Friday morning, open Friday from 4pm.',
      },
      {
        title: 'Current stock',
        content:
          '2021 Toyota Camry, 68,000 km, SAR 78,000. 2019 Hyundai Sonata, 95,000 km, SAR 52,000. 2022 Nissan Sunny, 40,000 km, SAR 61,000.',
      },
      {
        title: 'Financing',
        content:
          'Bank financing available with 20% down payment over 12 to 60 months. We do not offer in-house financing.',
      },
      {
        title: 'Test drives',
        content: 'Test drives require a valid Saudi driving licence. Book at least one day ahead.',
      },
    ],
  },
  {
    id: 'bright-smile',
    name: 'Bright Smile Dental',
    systemPrompt: [
      'You are the receptionist for Bright Smile Dental, a dental clinic in Dubai.',
      'Reply in the language the customer used.',
      'You are warm but efficient. Never give clinical advice - offer an appointment instead.',
      'Quote prices only from the knowledge base.',
    ].join(' '),
    knowledge: [
      {
        title: 'Opening hours',
        content: 'Monday to Saturday, 10am to 8pm. Closed Sunday.',
      },
      {
        title: 'Prices',
        content:
          'Consultation AED 200. Scaling and polishing AED 450. Whitening AED 1,500. Root canal from AED 2,200.',
      },
      {
        title: 'Insurance',
        content: 'We accept Daman and AXA. We do not accept Oman Insurance.',
      },
      {
        title: 'Emergencies',
        content:
          'Same-day emergency slots are held daily at 10am and 5pm. Severe pain or swelling should go to a hospital.',
      },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient(prismaClientOptions());

  try {
    for (const tenant of TENANTS) {
      await prisma.tenant.upsert({
        where: { id: tenant.id },
        create: { id: tenant.id, name: tenant.name, systemPrompt: tenant.systemPrompt },
        update: { name: tenant.name, systemPrompt: tenant.systemPrompt },
      });

      // Replaced wholesale so editing an entry above and re-running the seed
      // does not leave the old version behind.
      await prisma.knowledgeEntry.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.knowledgeEntry.createMany({
        data: tenant.knowledge.map((entry) => ({ ...entry, tenantId: tenant.id })),
      });

      console.log(`seeded ${tenant.id} (${tenant.knowledge.length} knowledge entries)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
