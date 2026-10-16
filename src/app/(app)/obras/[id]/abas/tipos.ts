import type { Role } from "@prisma/client";
import type { ObraAutorizada } from "@/lib/auth";

export type AbaObraProps = {
  obra: ObraAutorizada;
  role: Role;
};
