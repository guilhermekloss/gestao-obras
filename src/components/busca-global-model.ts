import type { Role } from "@prisma/client";
import { itensPara } from "@/components/nav-itens";

export type TipoResultado = "acao" | "tela" | "obra" | "fornecedor" | "lancamento" | "material";

export type ResultadoBusca = {
  tipo: TipoResultado;
  href: string;
  titulo: string;
  detalhe?: string;
};

export const ROTULO_TIPO: Record<TipoResultado, string> = {
  acao: "Ações",
  tela: "Ir para",
  obra: "Obras",
  fornecedor: "Fornecedores",
  lancamento: "Lançamentos",
  material: "Materiais",
};

const ORDEM: TipoResultado[] = ["acao", "tela", "obra", "fornecedor", "lancamento", "material"];

export function normalizarBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Atalhos que não dependem do banco: o que criar e para onde ir, conforme o papel. */
export function atalhosPara(role: Role): ResultadoBusca[] {
  const financeiro = role !== "CAMPO";
  const acoes: ResultadoBusca[] = [
    ...(financeiro
      ? [
          { tipo: "acao" as const, href: "/notas/nova", titulo: "Novo lançamento", detalhe: "Nota, recibo, folha ou guia" },
          { tipo: "acao" as const, href: "/notas/importar-xml", titulo: "Importar XML de NF-e" },
        ]
      : []),
    { tipo: "acao", href: "/diario/novo", titulo: "Novo RDO", detalhe: "Diário de obra de hoje" },
    ...(financeiro ? [{ tipo: "acao" as const, href: "/contas", titulo: "Pagar contas", detalhe: "Parcelas em aberto" }] : []),
  ];
  const telas: ResultadoBusca[] = [
    ...itensPara(role).map((i) => ({ tipo: "tela" as const, href: i.href, titulo: i.label })),
    { tipo: "tela", href: "/conta", titulo: "Minha conta" },
  ];
  return [...acoes, ...telas];
}

export function filtrarAtalhos(atalhos: ResultadoBusca[], termo: string): ResultadoBusca[] {
  const t = normalizarBusca(termo);
  if (!t) return atalhos;
  return atalhos.filter((a) => normalizarBusca(`${a.titulo} ${a.detalhe ?? ""}`).includes(t));
}

/** Resultados em seções, na ordem fixa de `ORDEM`; a posição `indice` é a da lista corrida (setas do teclado). */
export function emSecoes(resultados: ResultadoBusca[]): { tipo: TipoResultado; itens: (ResultadoBusca & { indice: number })[] }[] {
  let indice = 0;
  return ORDEM.map((tipo) => ({
    tipo,
    itens: resultados.filter((r) => r.tipo === tipo).map((r) => ({ ...r, indice: indice++ })),
  })).filter((s) => s.itens.length > 0);
}
