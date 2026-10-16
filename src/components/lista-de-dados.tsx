import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Lista de dados que se adapta à largura da tela, sem duplicar o conteúdo.
 *
 * - `modo="cartoes"` (padrão): tabela quando o contêiner tem 800 px ou mais; abaixo disso,
 *   um cartão por linha. Mede o contêiner, não a tela: o menu lateral e as colunas estreitas
 *   (ex.: equipe da obra) também entram na conta. Variantes `tabela:` e `cartao:` em globals.css.
 * - `modo="rolagem"`: tabela larga que rola na horizontal, com a primeira coluna fixa.
 *   Serve para matrizes e análises em que comparar colunas importa (curva ABC, fluxo mensal).
 *
 * Existe um único DOM: o CSS troca o desenho. Por isso `<select>`, caixas de seleção e
 * diálogos dentro das células não duplicam. Como `display` muda o papel nativo da tabela,
 * os papéis ARIA ficam explícitos.
 *
 * Valores (R$, quantidades, %) usam `numerica`: à direita e com algarismos tabulares (`num`).
 * Estado vai sempre num `StatusBadge`; categoria (tipo de documento, papel) vai no `Badge`.
 */

/** Onde a célula fica no cartão do celular. */
export type PapelNoCartao =
  | "selecao" // caixa de seleção, à esquerda
  | "titulo" // o que identifica a linha (nome, fornecedor)
  | "valor" // o número que importa (total, valor), no canto direito do título
  | "estado" // StatusBadge, logo abaixo do título
  | "acao" // botões da linha, abaixo do valor
  | "detalhe"; // "Rótulo: valor", uma linha por coluna

export type ColunaDados<T> = {
  id: string;
  /** Cabeçalho da tabela e rótulo do detalhe no cartão. */
  titulo: string;
  celula: (linha: T) => ReactNode;
  /** Posição no cartão. Padrão: "detalhe". */
  papel?: PapelNoCartao;
  /** Número ou valor monetário: alinha à direita, algarismos tabulares. */
  numerica?: boolean;
  /** Fica só na tabela; no cartão a informação já está em outro lugar ou é secundária. */
  semCartao?: boolean;
  /** Cabeçalho só para leitor de tela (seleção, ações). */
  tituloOculto?: boolean;
  /** Conteúdo próprio do cabeçalho da tabela (ex.: "selecionar todas"). */
  cabecalho?: ReactNode;
  /** Classes extras da célula (largura, truncar, cor). */
  classe?: string;
  /** Classes extras do cabeçalho (largura). */
  classeCabecalho?: string;
};

type Props<T> = {
  /** Nome da lista para leitor de tela ("Lançamentos"). */
  legenda: string;
  colunas: ColunaDados<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  modo?: "cartoes" | "rolagem";
  /** Mostrado no lugar da lista quando não há linhas. */
  vazio?: ReactNode;
  /** Classes da linha (destaque de vencida, rebaixar inativo). */
  classeDaLinha?: (linha: T) => string | undefined;
  /** Conteúdo de largura total logo abaixo da linha (no cartão, fica dentro dele). */
  linhaExtra?: (linha: T) => ReactNode;
  /** Rodapé de largura total (total da nota). */
  rodape?: ReactNode;
};

/** Link que identifica a linha: 44 px de altura no celular, como o resto dos alvos de toque. */
export const LINK_DA_LINHA =
  "inline-flex min-h-11 min-w-11 items-center hover:underline tabela:min-h-0 tabela:min-w-0 tabela:pointer-coarse:min-h-10";

// Posição explícita no grid do cartão: não depende da ordem das colunas.
const POSICAO = {
  simples: {
    selecao: "",
    titulo: "col-start-1 row-start-1",
    valor: "col-start-2 row-start-1 text-right",
    estado: "col-start-1 row-start-2 self-center",
    acao: "col-start-2 row-start-2 self-center justify-self-end",
    detalhe: "col-span-2",
  },
  comSelecao: {
    selecao: "col-start-1 row-start-1 self-start",
    titulo: "col-start-2 row-start-1",
    valor: "col-start-3 row-start-1 text-right",
    estado: "col-start-2 row-start-2 self-center",
    acao: "col-start-3 row-start-2 self-center justify-self-end",
    detalhe: "col-start-2 col-span-2",
  },
} satisfies Record<string, Record<PapelNoCartao, string>>;

const TEM_TRACO = new Set<PapelNoCartao>(["detalhe", "valor", "titulo"]);

// A primeira coluna fica fixa à esquerda; o fundo vem da linha (`bg-inherit`) para o
// conteúdo que rola não aparecer por baixo.
const COLUNA_FIXA = "sticky left-0 z-10 shadow-[inset_-1px_0_0_var(--border)]";

export function ListaDeDados<T>({
  legenda,
  colunas,
  linhas,
  chave,
  modo = "cartoes",
  vazio = "Nada por aqui.",
  classeDaLinha,
  linhaExtra,
  rodape,
}: Props<T>) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-md border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
        {vazio}
      </div>
    );
  }

  const rolagem = modo === "rolagem";
  const comSelecao = colunas.some((c) => c.papel === "selecao");
  const comValor = colunas.some((c) => c.papel === "valor");
  const posicao = comSelecao ? POSICAO.comSelecao : POSICAO.simples;

  function classeDaCelula(c: ColunaDados<T>, indice: number) {
    if (rolagem) {
      return cn(
        indice === 0 && COLUNA_FIXA,
        indice === 0 && "bg-inherit",
        c.numerica && "text-right num",
        c.classe,
      );
    }
    const papel = c.papel ?? "detalhe";
    return cn(
      // celular: cada célula vira um bloco dentro do grid do cartão
      "block min-w-0 p-0 break-words whitespace-normal cartao:empty:hidden",
      posicao[papel],
      papel === "titulo" && !comValor && "col-span-2",
      papel === "titulo" && "text-base font-medium",
      papel === "valor" && "text-base font-medium num",
      papel === "detalhe" &&
        "text-sm before:mr-1.5 before:text-muted-foreground before:content-[attr(data-rotulo)]",
      c.semCartao && "cartao:hidden",
      // tabela
      "tabela:table-cell tabela:p-2 tabela:text-sm tabela:font-normal tabela:whitespace-nowrap tabela:before:hidden",
      c.numerica && "num tabela:text-right",
      c.classe,
    );
  }

  return (
    <div className="@container">
      <div className={cn("rounded-md", rolagem ? "border bg-card" : "tabela:border tabela:bg-card")}>
        <Table
          aria-label={legenda}
          role="table"
          className={cn(!rolagem && "grid gap-2 tabela:table")}
          container={
            rolagem
              ? { role: "region", "aria-label": `${legenda}: role para o lado para ver todas as colunas`, tabIndex: 0 }
              : { className: "overflow-visible tabela:overflow-x-auto" }
          }
        >
          <TableHeader role="rowgroup" className={cn(!rolagem && "sr-only block tabela:not-sr-only tabela:table-header-group")}>
            <TableRow role="row" className="hover:bg-transparent">
              {colunas.map((c, i) => (
                <TableHead
                  key={c.id}
                  role="columnheader"
                  className={cn(
                    rolagem && i === 0 && cn(COLUNA_FIXA, "bg-card"),
                    c.numerica && (rolagem ? "text-right" : "tabela:text-right"),
                    c.classeCabecalho,
                  )}
                >
                  {c.tituloOculto && <span className="sr-only">{c.titulo}</span>}
                  {c.cabecalho ?? (c.tituloOculto ? null : c.titulo)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          {linhas.map((linha) => {
            const extra = linhaExtra?.(linha);
            return (
              // um grupo por registro: o cartão e a linha extra ficam juntos
              <tbody
                key={chave(linha)}
                data-slot="table-body"
                role="rowgroup"
                className={
                rolagem
                  ? "last-of-type:[&>tr:last-child]:border-b-0"
                  : "block tabela:table-row-group tabela:last-of-type:[&>tr:last-child]:border-b-0"
              }
              >
                <TableRow
                  role="row"
                  className={cn(
                    "bg-card",
                    rolagem
                      ? "hover:bg-[color-mix(in_oklab,var(--card),var(--muted)_50%)]"
                      : cn(
                          "grid items-start gap-x-3 gap-y-1.5 rounded-md border p-3",
                          comSelecao
                            ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                            : "grid-cols-[minmax(0,1fr)_auto]",
                          "tabela:table-row tabela:rounded-none tabela:border-0 tabela:border-b tabela:p-0",
                          extra && "cartao:rounded-b-none cartao:border-b-0 tabela:border-b-0",
                        ),
                    classeDaLinha?.(linha),
                  )}
                >
                  {colunas.map((c, i) => {
                    const conteudo = c.celula(linha);
                    // sem valor: traço na tabela e nada no cartão (não mostra "Efetivo: —")
                    const semValor = conteudo === null || conteudo === undefined || conteudo === false || conteudo === "";
                    const traco = semValor && TEM_TRACO.has(c.papel ?? "detalhe");
                    return (
                      <TableCell
                        key={c.id}
                        role="cell"
                        data-rotulo={`${c.titulo}:`}
                        className={cn(classeDaCelula(c, i), traco && "cartao:hidden")}
                      >
                        {traco ? "—" : conteudo}
                      </TableCell>
                    );
                  })}
                </TableRow>
                {extra && (
                  <TableRow
                    role="row"
                    className={cn(
                      "bg-card",
                      rolagem
                        ? ""
                        : "block rounded-b-md border border-t-0 px-3 pb-3 tabela:table-row tabela:rounded-none tabela:border-0 tabela:border-b tabela:p-0",
                    )}
                  >
                    <TableCell
                      role="cell"
                      colSpan={colunas.length}
                      className={cn(
                        "whitespace-normal",
                        !rolagem && "block p-0 tabela:table-cell tabela:p-2 tabela:pt-0",
                      )}
                    >
                      {extra}
                    </TableCell>
                  </TableRow>
                )}
              </tbody>
            );
          })}

          {rodape && (
            <TableFooter role="rowgroup" className={cn(!rolagem && "block tabela:table-footer-group")}>
              <TableRow role="row" className={cn(!rolagem && "block tabela:table-row")}>
                <TableCell
                  role="cell"
                  colSpan={colunas.length}
                  className={cn(!rolagem && "block px-3 py-2 tabela:table-cell tabela:p-2")}
                >
                  {rodape}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {rolagem && (
        <p className="mt-1.5 hidden text-xs text-muted-foreground cartao:block">
          Role para o lado para ver todas as colunas.
        </p>
      )}
    </div>
  );
}
