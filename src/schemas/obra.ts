import { z } from "zod";
import { normalizarCno } from "@/services/cno";
import { dataIso, texto } from "./comum";

export const ETAPAS_PADRAO = [
  "Fundação",
  "Estrutura",
  "Alvenaria",
  "Instalações",
  "Acabamento",
];

export const obraSchema = z.object({
  nome: texto(200, "O nome").min(1, "Nome é obrigatório"),
  codigo: texto(40, "O código").min(1, "Código é obrigatório"),
  // guardado só em dígitos: é por ele que a nota importada acha a obra
  cno: texto(40, "O CNO")
    .optional()
    .refine((v) => !v?.trim() || normalizarCno(v) !== null, "O CNO deve ter 12 dígitos (XX.XXX.XXXXX/XX)")
    .transform((v) => normalizarCno(v) ?? undefined),
  endereco: texto(500, "O endereço").optional(),
  status: z.enum(["PLANEJAMENTO", "ANDAMENTO", "CONCLUIDA", "PAUSADA"]),
  inicioEm: dataIso().optional(),
  criarEtapasPadrao: z.boolean().optional(),
});

export const etapaSchema = z.object({
  nome: texto(200, "O nome").min(1, "Nome é obrigatório"),
});
