import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Em produção a senha padrão é proibida: passe SEED_ADMIN_SENHA (ver docs/deploy-gcp.md).
  const senha = process.env.SEED_ADMIN_SENHA ?? (process.env.NODE_ENV === "production" ? "" : "admin123");
  if (senha.length < 12 && process.env.NODE_ENV === "production") {
    throw new Error("Defina SEED_ADMIN_SENHA com pelo menos 12 caracteres para rodar o seed em produção.");
  }
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@obras.local";
  const senhaHash = await hash(senha, 12);
  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nome: "Administrador",
      email,
      senhaHash,
      role: "ADMIN",
    },
  });
  console.log(`Seed ok: usuário admin (${admin.email}${process.env.SEED_ADMIN_SENHA ? "" : " / senha: admin123"})`);

  const ETAPAS_PADRAO = ["Fundação", "Estrutura", "Alvenaria", "Instalações", "Acabamento"];
  const LOTES = ["01", "02", "03", "19", "20", "21"];
  for (const n of LOTES) {
    await prisma.obra.upsert({
      where: { codigo: `L${n}` },
      update: {},
      create: {
        nome: `Lote ${n}`,
        codigo: `L${n}`,
        status: "ANDAMENTO",
        etapas: { create: ETAPAS_PADRAO.map((nome, i) => ({ nome, ordem: i + 1 })) },
      },
    });
  }
  console.log(`Seed ok: ${LOTES.length} obras (lotes) com etapas padrão`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
