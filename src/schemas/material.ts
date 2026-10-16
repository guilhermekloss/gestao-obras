import { z } from "zod";

export const materialSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200, "O nome pode ter no máximo 200 caracteres"),
  unidade: z.string().trim().min(1, "Unidade é obrigatória").max(20, "A unidade pode ter no máximo 20 caracteres"),
  tipo: z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"]).default("MATERIAL"),
  categoria: z.string().trim().max(60, "A categoria pode ter no máximo 60 caracteres").optional(),
});

export type MaterialInput = z.infer<typeof materialSchema>;
