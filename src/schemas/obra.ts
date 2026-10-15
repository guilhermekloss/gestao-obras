import { z } from "zod";
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
  cno: texto(40, "O CNO").optional(),
  endereco: texto(500, "O endereço").optional(),
  status: z.enum(["PLANEJAMENTO", "ANDAMENTO", "CONCLUIDA", "PAUSADA"]),
  inicioEm: dataIso().optional(),
  criarEtapasPadrao: z.boolean().optional(),
});


export const etapaSchema = z.object({
  nome: texto(200, "O nome").min(1, "Nome é obrigatório"),
});
