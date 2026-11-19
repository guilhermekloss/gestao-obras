import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConferenciaTributaria } from "@/components/conferencia-tributaria";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { StatusBadge, type Estado } from "@/components/status-badge";
import { formatarMoeda } from "@/lib/format";
import type { SituacaoCredito } from "@/services/tributacao/credito";
import type { IbsCbsDaNota } from "@/services/tributacao/conferencia-db";

/** Colunas de ItemNota mostradas na seção (alíquotas em texto decimal). */
export type ItemIbsCbs = {
  descricao: string;
  cst: string | null;
  cClassTrib: string | null;
  ibsCbsBaseCents: number | null;
  pCbs: string | null;
  pIbsUf: string | null;
  pIbsMun: string | null;
  cbsCents: number | null;
  ibsUfCents: number | null;
  ibsMunCents: number | null;
};

const SITUACAO: Record<SituacaoCredito, { rotulo: string; estado: Estado }> = {
  PERMITIDO: { rotulo: "Gera crédito", estado: "no-prazo" },
  PARCIAL: { rotulo: "Crédito parcial", estado: "atencao" },
  VEDADO: { rotulo: "Crédito vedado", estado: "atencao" },
  SEM_DESTAQUE: { rotulo: "Sem destaque", estado: "neutro" },
  PERIODO_TESTE: { rotulo: "Ano de teste: sem crédito", estado: "neutro" },
  REGIME_NAO_REGULAR: { rotulo: "Simples: sem crédito", estado: "neutro" },
  REGIME_NAO_INFORMADO: { rotulo: "Regime da empresa não informado", estado: "atencao" },
  CLASSIFICACAO_DESCONHECIDA: { rotulo: "Classificação não conferida", estado: "atencao" },
};

const pct = (texto: string | null) => `${Number(texto).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

function aliquotas(i: ItemIbsCbs): string | null {
  const partes = [
    i.pCbs !== null && `CBS ${pct(i.pCbs)}`,
    i.pIbsUf !== null && `IBS UF ${pct(i.pIbsUf)}`,
    i.pIbsMun !== null && `IBS município ${pct(i.pIbsMun)}`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Seção "IBS/CBS" do detalhe da nota: o que o fornecedor destacou, a situação do crédito e os avisos. */
export function IbsCbsDaNota({ itens, analise }: { itens: ItemIbsCbs[]; analise: IbsCbsDaNota }) {
  const linhas = itens.map((item, i) => ({ item, i, ...analise.itens[i] })).filter((l) => l.item.cst || l.item.cClassTrib);
  const descricoes = itens.map((i) => i.descricao);

  const colunas: ColunaDados<(typeof linhas)[number]>[] = [
    {
      id: "item",
      titulo: "Item",
      papel: "titulo",
      classe: "tabela:whitespace-normal",
      celula: ({ item, classificacaoDescricao }) => (
        <>
          <p className="font-medium">{item.descricao}</p>
          <p className="text-xs font-normal text-muted-foreground">
            CST {item.cst ?? "-"} · classificação {item.cClassTrib ?? "-"}
            {classificacaoDescricao && ` (${classificacaoDescricao})`}
          </p>
        </>
      ),
    },
    {
      id: "base",
      titulo: "Base",
      numerica: true,
      celula: ({ item }) => (item.ibsCbsBaseCents === null ? null : formatarMoeda(item.ibsCbsBaseCents)),
    },
    { id: "aliquotas", titulo: "Alíquotas", classe: "tabela:whitespace-normal", celula: ({ item }) => aliquotas(item) },
    {
      id: "valores",
      titulo: "Destacado",
      numerica: true,
      celula: ({ item }) => (
        <>
          <p>{formatarMoeda((item.cbsCents ?? 0) + (item.ibsUfCents ?? 0) + (item.ibsMunCents ?? 0))}</p>
          <p className="text-xs font-normal text-muted-foreground">
            CBS {formatarMoeda(item.cbsCents ?? 0)} · IBS {formatarMoeda((item.ibsUfCents ?? 0) + (item.ibsMunCents ?? 0))}
          </p>
        </>
      ),
    },
    {
      id: "credito",
      titulo: "Crédito",
      papel: "estado",
      celula: ({ credito }) => (
        <div className="grid justify-items-start gap-1 tabela:justify-items-end">
          <StatusBadge estado={SITUACAO[credito.situacao].estado}>{SITUACAO[credito.situacao].rotulo}</StatusBadge>
          {credito.creditoCents > 0 && <span className="num">{formatarMoeda(credito.creditoCents)}</span>}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>IBS/CBS</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {analise.temDados && (
          <>
            <p className="text-sm text-muted-foreground">
              O que o fornecedor destacou na nota e quanto disso volta como crédito para a empresa. O valor sem crédito
              fica no custo da obra.
            </p>
            <ListaDeDados
              legenda="IBS/CBS por item"
              linhas={linhas}
              chave={({ i }) => String(i)}
              colunas={colunas}
              rodape={
                <div className="grid gap-1">
                  <div className="flex justify-between">
                    <span>Destacado na nota</span>
                    <span className="num">{formatarMoeda(analise.destacadoCents)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Crédito da nota</span>
                    <span className="num">{formatarMoeda(analise.creditoCents)}</span>
                  </div>
                </div>
              }
            />
          </>
        )}
        <ConferenciaTributaria achados={analise.achados} descricoes={descricoes} mostrarVazio={analise.temDados} />
      </CardContent>
    </Card>
  );
}
