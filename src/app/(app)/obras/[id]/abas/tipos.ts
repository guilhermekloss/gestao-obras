import type { Role } from "@prisma/client";

/** Contrato comum das abas da página da obra — cada aba é um server component independente. */
export type AbaObraProps = {
  obraId: string;
  role: Role;
};
