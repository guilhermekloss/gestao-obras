import { z } from "zod";
import { CLIMAS } from "@/services/rdo";

/**
 * Rascunho do RDO no navegador: quem preenche em campo perde sinal, bateria ou a aba.
 * Só lógica pura aqui (ler, validar, comparar); o formulário cuida do localStorage.
 */

export const VALIDADE_RASCUNHO_MS = 7 * 24 * 60 * 60 * 1000;

const item = z.object({ nome: z.string().max(100), qtd: z.number().int().min(1).max(999) });

const conteudoSchema = z.object({
  obraId: z.string().max(100),
  data: z.string().max(10),
  climaManha: z.enum([...CLIMAS, ""] as const),
  climaTarde: z.enum([...CLIMAS, ""] as const),
  condicao: z.enum(["PRATICAVEL", "PARCIAL", "IMPRATICAVEL", ""]),
  efetivo: z.array(item).max(100),
  equipamentos: z.array(item).max(100),
  atividades: z.string().max(10_000),
  ocorrencias: z.string().max(10_000),
  fotos: z.array(z.object({ url: z.string().max(2000) })).max(60),
});

export type ConteudoRdo = z.infer<typeof conteudoSchema>;

const rascunhoSchema = conteudoSchema.extend({ v: z.literal(1), salvoEm: z.number() });

export type RascunhoRdo = ConteudoRdo & { salvoEm: number };

/** Uma chave por RDO em edição e uma para o RDO novo. */
export function chaveRascunho(rdoId?: string): string {
  return `rdo:rascunho:${rdoId ?? "novo"}`;
}

export function serializarRascunho(conteudo: ConteudoRdo, agora: number): string {
  return JSON.stringify({ v: 1, salvoEm: agora, ...conteudo });
}

/** Lê o texto guardado. Devolve null se estiver ausente, corrompido, de outra versão ou vencido. */
export function lerRascunho(texto: string | null, agora: number): RascunhoRdo | null {
  if (!texto) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  const r = rascunhoSchema.safeParse(bruto);
  if (!r.success) return null;
  const { v: _v, ...rascunho } = r.data;
  if (agora - rascunho.salvoEm > VALIDADE_RASCUNHO_MS || rascunho.salvoEm > agora + 60_000) return null;
  return rascunho;
}

/**
 * Texto para comparar "mudou alguma coisa?". No RDO novo, obra e data vêm preenchidas sozinhas
 * (última obra, hoje), então não contam como edição.
 */
export function assinaturaDoConteudo(c: ConteudoRdo, ignorarObraEData: boolean): string {
  return JSON.stringify(ignorarObraEData ? { ...c, obraId: "", data: "" } : c);
}

export function horaSalvo(salvoEm: number): string {
  return new Date(salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "hoje às 14:32", "ontem às 09:10" ou "15/10 às 09:10". */
export function quandoSalvo(salvoEm: number, agora: number): string {
  const d = new Date(salvoEm);
  const hoje = new Date(agora);
  const ontem = new Date(agora);
  ontem.setDate(hoje.getDate() - 1);
  const hora = horaSalvo(salvoEm);
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`;
  if (d.toDateString() === ontem.toDateString()) return `ontem às ${hora}`;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes} às ${hora}`;
}
