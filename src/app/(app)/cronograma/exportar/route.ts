import type { NextRequest } from "next/server";
import { exigirAcessoObra, obraAutorizada, usuarioAtual } from "@/lib/auth";
import { id } from "@/schemas/comum";
import { veFinanceiro } from "@/services/acesso";
import { montarCsvCronograma, nomeArquivoCsvCronograma } from "@/services/cronograma-csv";
import { carregarCronograma } from "../dados";

// GET /cronograma/exportar?obra=<id>: o cronograma da obra em CSV. Peso (orçamento) só para quem vê valores.
export async function GET(request: NextRequest) {
  const usuario = await usuarioAtual();
  if (!usuario) return new Response(null, { status: 401 });

  const parametro = id().safeParse(request.nextUrl.searchParams.get("obra") ?? "");
  if (!parametro.success) return new Response("Informe a obra.", { status: 400 });
  const obraId = parametro.data;

  // sem acesso e obra inexistente respondem igual: não revela que a obra existe
  try {
    exigirAcessoObra(usuario, obraId);
  } catch {
    return new Response(null, { status: 404 });
  }
  const obra = await obraAutorizada(usuario, obraId);
  if (!obra) return new Response(null, { status: 404 });

  const comPeso = veFinanceiro(usuario.role);
  const cronograma = await carregarCronograma(obra, { comPesos: comPeso });
  const csv = montarCsvCronograma(
    cronograma.etapas.map((e) => ({
      nome: e.nome,
      inicio: e.inicioPrevisto,
      fim: e.fimPrevisto,
      previstoHojeBp: e.previstoHojeBp,
      realizadoBp: e.realizadoBp,
      desvioBp: e.desvioBp,
      situacao: e.situacao,
      linhaBaseInicio: e.linhaBase?.inicio ?? null,
      linhaBaseFim: e.linhaBase?.fim ?? null,
      variacaoFimDias: e.variacaoFimDias,
      pesoBp: comPeso ? e.pesoBp : null,
    })),
    { comPeso },
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivoCsvCronograma(obra.codigo, cronograma.hoje)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
