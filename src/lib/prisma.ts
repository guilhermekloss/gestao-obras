import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// guardado no globalThis também em produção: se o módulo for avaliado em mais de um bundle, o processo segue com um só pool
export const prisma = (globalForPrisma.prisma ??= new PrismaClient());
