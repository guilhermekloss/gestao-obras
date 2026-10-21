import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// guardado no globalThis também em produção: se o módulo for avaliado em mais de um bundle, o processo segue com um só pool
// transações: os padrões do Prisma, explícitos — 2 s esperando conexão, 5 s de execução (só DML curto dentro delas)
export const prisma = (globalForPrisma.prisma ??= new PrismaClient({
  transactionOptions: { maxWait: 2_000, timeout: 5_000 },
}));
