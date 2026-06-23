import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient across hot reloads (dev) and warm serverless
// invocations (Vercel) to avoid exhausting the database connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

globalForPrisma.prisma = prisma;
