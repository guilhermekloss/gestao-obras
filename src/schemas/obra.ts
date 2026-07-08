import { z } from "zod";

export const ETAPAS_PADRAO = [
  "Fundação",
  "Estrutura",
  "Alvenaria",
  "Instalações",
  "Acabamento",
];

export const obraSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  codigo: z.string().min(1, "Código é obrigatório"),
  cno: z.string().optional(),
  endereco: z.string().optional(),
  status: z.enum(["PLANEJAMENTO", "ANDAMENTO", "CONCLUIDA", "PAUSADA"]),
  inicioEm: z.string().optional(), // yyyy-mm-dd
  criarEtapasPadrao: z.boolean().optional(),
});

export type ObraInput = z.infer<typeof obraSchema>;

export const etapaSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
});
