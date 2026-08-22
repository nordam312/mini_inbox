import { PrismaPg } from '@prisma/adapter-pg';

export function prismaClientOptions() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy api/.env.example to api/.env.');
  }

  return { adapter: new PrismaPg({ connectionString }) };
}
