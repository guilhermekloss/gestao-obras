"use server";

import { z } from "zod";
import { exigirPapel } from "@/lib/auth";
import { conferirTributacao, itemDaNfe, type AchadoConferencia } from "@/services/tributacao/conferencia";
import { carregarReferenciasConferencia } from "@/services/tributacao/conferencia-db";

const cents = z.number().int().nullable();
const decimal = z.string().max(20).nullable();
const total = z.number().int();

// só o que a conferência lê: a prévia manda a nota já lida no client, e o que sobra é descartado
const notaSchema = z.object({
  dataEmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  crtEmitente: z.string().max(1).nullable(),
  itens: z
    .array(
      z.object({
        ncm: z.string().max(20).nullable(),
        ibsCbs: z
          .object({
            cst: z.string().max(10),
            cClassTrib: z.string().max(10),
            ibsCbsBaseCents: cents,
            pCbs: decimal,
            pIbsUf: decimal,
            pIbsMun: decimal,
            pRedCbs: decimal,
            pRedIbs: decimal,
            cbsCents: cents,
            ibsUfCents: cents,
            ibsMunCents: cents,
            ibsCbsDiferidoCents: cents,
          })
          .optional(),
      }),
    )
    .max(500),
  totaisIbsCbs: z
    .object({
      ibsCbsBaseCents: total,
      cbsCents: total,
      ibsUfCents: total,
      ibsMunCents: total,
      ibsCbsDiferidoCents: total,
      credPresCents: total,
      cbsMonoCents: total,
      ibsMonoCents: total,
    })
    .nullable(),
});

/** Avisos de IBS/CBS da nota da prévia. Só avisa: erro de leitura ou de banco não impede a importação. */
export async function conferirTributacaoDaPrevia(nota: unknown): Promise<AchadoConferencia[]> {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const lida = notaSchema.safeParse(nota);
  if (!lida.success) return [];
  const { dataEmissao, crtEmitente, itens, totaisIbsCbs } = lida.data;
  const { classificacoes, nomenclaturas } = await carregarReferenciasConferencia(itens.map((i) => i.ibsCbs?.cClassTrib));
  return conferirTributacao(itens.map(itemDaNfe), { dataEmissao, crtEmitente, classificacoes, nomenclaturas, totais: totaisIbsCbs });
}
