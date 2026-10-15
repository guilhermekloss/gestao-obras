import { addWeeks, startOfWeek } from "date-fns";
import { custoRateado } from "./rateio";

/**
 * Catálogo das ações registradas no log de auditoria. A chave é o `tipo`
 * gravado em `Atividade`; o rótulo é o texto usado quando a action não
 * descreve a ação com mais detalhe.
 */
export const TIPOS_ATIVIDADE = {
  "nota.criar": { rotulo: "Lançou um documento", categoria: "financeiro" },
  "nota.editar": { rotulo: "Editou um lançamento", categoria: "financeiro" },
  "nota.excluir": { rotulo: "Excluiu um lançamento", categoria: "financeiro" },
  "nota.importar_xml": { rotulo: "Importou NF-e por XML", categoria: "financeiro" },
  "parcela.pagar": { rotulo: "Marcou parcelas como pagas", categoria: "financeiro" },
  "parcela.reabrir": { rotulo: "Reabriu uma parcela", categoria: "financeiro" },
  "importacao.planilhas": { rotulo: "Importou planilhas", categoria: "financeiro" },
  "orcamento.salvar": { rotulo: "Alterou o orçamento", categoria: "financeiro" },
  "obra.criar": { rotulo: "Cadastrou uma obra", categoria: "cadastro" },
  "obra.editar": { rotulo: "Editou uma obra", categoria: "cadastro" },
  "obra.excluir": { rotulo: "Excluiu uma obra", categoria: "cadastro" },
  "etapa.criar": { rotulo: "Criou uma etapa", categoria: "cadastro" },
  "etapa.excluir": { rotulo: "Excluiu uma etapa", categoria: "cadastro" },
  "cronograma.datas": { rotulo: "Alterou datas do cronograma", categoria: "cadastro" },
  "fornecedor.criar": { rotulo: "Cadastrou um fornecedor", categoria: "cadastro" },
  "fornecedor.editar": { rotulo: "Editou um fornecedor", categoria: "cadastro" },
  "fornecedor.excluir": { rotulo: "Excluiu um fornecedor", categoria: "cadastro" },
  "rdo.criar": { rotulo: "Registrou um RDO", categoria: "campo" },
  "rdo.editar": { rotulo: "Editou um RDO", categoria: "campo" },
  "rdo.excluir": { rotulo: "Excluiu um RDO", categoria: "campo" },
  "medicao.criar": { rotulo: "Lançou avanço físico", categoria: "campo" },
  "medicao.excluir": { rotulo: "Excluiu um avanço físico", categoria: "campo" },
  "usuario.criar": { rotulo: "Cadastrou um usuário", categoria: "acesso" },
  "usuario.editar": { rotulo: "Alterou um usuário", categoria: "acesso" },
  "convite.criar": { rotulo: "Gerou um link de convite", categoria: "acesso" },
  "convite.renovar": { rotulo: "Gerou um novo link de convite", categoria: "acesso" },
  "convite.revogar": { rotulo: "Cancelou um convite", categoria: "acesso" },
  "convite.aceito": { rotulo: "Fez o cadastro pelo convite", categoria: "acesso" },
  "conta.login": { rotulo: "Entrou no sistema", categoria: "acesso" },
  "conta.senha": { rotulo: "Trocou a própria senha", categoria: "acesso" },
  "conta.encerrar_sessoes": { rotulo: "Encerrou as sessões em todos os dispositivos", categoria: "acesso" },
} as const satisfies Record<string, { rotulo: string; categoria: CategoriaAtividade }>;

export type TipoAtividade = keyof typeof TIPOS_ATIVIDADE;
export type CategoriaAtividade = "financeiro" | "cadastro" | "campo" | "acesso";

export const CATEGORIA_LABELS: Record<CategoriaAtividade, string> = {
  financeiro: "Financeiro",
  cadastro: "Cadastros",
  campo: "Campo",
  acesso: "Acessos",
};

export function categoriaDoTipo(tipo: string): CategoriaAtividade | null {
  return tipo in TIPOS_ATIVIDADE ? TIPOS_ATIVIDADE[tipo as TipoAtividade].categoria : null;
}

export function tiposDaCategoria(categoria: CategoriaAtividade): TipoAtividade[] {
  return (Object.keys(TIPOS_ATIVIDADE) as TipoAtividade[]).filter(
    (t) => TIPOS_ATIVIDADE[t].categoria === categoria,
  );
}

/** Detalhe que a action anota sobre o que fez — vira a linha do log. */
export type DetalheAtividade = {
  descricao?: string;
  entidade?: "nota" | "rdo" | "obra" | "fornecedor" | "usuario" | "convite" | "medicao";
  entidadeId?: string;
  obraIds?: string[];
  valorCents?: number;
};

/**
 * Onde abrir o registro de uma linha do log. Exclusões não têm link (o
 * registro não existe mais); avanço físico abre o cronograma da obra.
 */
export function linkAtividade(a: {
  tipo: string;
  entidade: string | null;
  entidadeId: string | null;
  obraIds: string[];
}): string | null {
  if (a.tipo.endsWith(".excluir") || a.tipo === "convite.revogar") return null;
  const id = a.entidadeId;
  switch (a.entidade) {
    case "nota":
      return id ? `/notas/${id}` : null;
    case "rdo":
      return id ? `/diario/${id}` : null;
    case "obra":
      return id ? `/obras/${id}` : null;
    case "fornecedor":
      return id ? `/fornecedores/${id}` : null;
    case "usuario":
      return id ? `/usuarios/${id}` : null;
    case "convite":
      return "/usuarios?aba=convites";
    case "medicao":
      return a.obraIds[0] ? `/cronograma?obra=${a.obraIds[0]}&aba=avanco` : null;
    default:
      return a.obraIds.length === 1 ? `/obras/${a.obraIds[0]}` : null;
  }
}

/** Uma barra por semana (segunda a domingo), da mais antiga para a atual. */
export function serieSemanal(
  datas: Date[],
  semanas: number,
  agora: Date = new Date(),
): { inicio: Date; total: number }[] {
  const atual = startOfWeek(agora, { weekStartsOn: 1 });
  const serie = Array.from({ length: semanas }, (_, i) => ({
    inicio: addWeeks(atual, i - (semanas - 1)),
    total: 0,
  }));
  const primeira = serie[0].inicio.getTime();
  const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
  for (const d of datas) {
    const t = startOfWeek(d, { weekStartsOn: 1 }).getTime();
    if (t < primeira || t > atual.getTime()) continue;
    // arredonda: semanas com troca de horário de verão têm 1h a mais ou a menos
    serie[Math.round((t - primeira) / SEMANA_MS)].total += 1;
  }
  return serie;
}

type ResumoObraUsuario = {
  obraId: string;
  rdos: number;
  medicoes: number;
  lancamentos: number;
  /** soma da parte de cada lançamento rateada para esta obra */
  valorCents: number;
  ultimaEm: Date;
};

/**
 * O que um usuário produziu em cada obra, a partir dos próprios registros
 * (RDOs que escreveu, avanços que lançou, notas que lançou) — vale também
 * para o histórico de antes do log de auditoria existir.
 */
export function resumirPorObra(dados: {
  rdos: { obraId: string; criadoEm: Date }[];
  medicoes: { obraId: string; criadoEm: Date }[];
  notas: { criadoEm: Date; totalCents: number; rateios: { obraId: string; fracaoBp: number }[] }[];
}): ResumoObraUsuario[] {
  const mapa = new Map<string, ResumoObraUsuario>();
  const obter = (obraId: string, em: Date) => {
    let r = mapa.get(obraId);
    if (!r) {
      r = { obraId, rdos: 0, medicoes: 0, lancamentos: 0, valorCents: 0, ultimaEm: em };
      mapa.set(obraId, r);
    }
    if (em > r.ultimaEm) r.ultimaEm = em;
    return r;
  };
  for (const rdo of dados.rdos) obter(rdo.obraId, rdo.criadoEm).rdos += 1;
  for (const m of dados.medicoes) obter(m.obraId, m.criadoEm).medicoes += 1;
  for (const n of dados.notas) {
    for (const r of n.rateios) {
      const resumo = obter(r.obraId, n.criadoEm);
      resumo.lancamentos += 1;
      resumo.valorCents += custoRateado(n.totalCents, r.fracaoBp);
    }
  }
  return [...mapa.values()].sort((a, b) => b.ultimaEm.getTime() - a.ultimaEm.getTime());
}

/**
 * Situação de uso de uma conta, para o admin achar contas paradas: quem
 * nunca entrou e quem não entra há mais de `diasParado` dias.
 */
export function situacaoDeUso(
  u: { ativo: boolean; ultimoAcessoEm: Date | null },
  agora: Date = new Date(),
  diasParado = 30,
): "inativo" | "nunca" | "parado" | "em_uso" {
  if (!u.ativo) return "inativo";
  if (!u.ultimoAcessoEm) return "nunca";
  const dias = (agora.getTime() - u.ultimoAcessoEm.getTime()) / (24 * 60 * 60 * 1000);
  return dias > diasParado ? "parado" : "em_uso";
}
