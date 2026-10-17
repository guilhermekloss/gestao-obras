-- Assistente de navegação: guarda quando a pessoa viu o pop-up de boas-vindas (nulo = ainda não viu).

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "assistenteVistoEm" TIMESTAMP(3);
