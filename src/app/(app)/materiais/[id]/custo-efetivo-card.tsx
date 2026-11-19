import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { StatusBadge } from "@/components/status-badge";
import { AvisoRegimeCredito } from "@/components/aviso-regime-credito";
import { RegimeFornecedorBadge } from "../../fornecedores/regime-badge";
import { formatarData, formatarMoeda } from "@/lib/format";
import type { CustoEfetivoDoMaterial } from "@/services/tributacao/custo-efetivo-db";
import { PERIODOS_MESES, type GrupoUnidade, type LinhaFornecedor } from "@/services/tributacao/custo-efetivo";

function colunas(grupo: GrupoUnidade): ColunaDados<LinhaFornecedor>[] {
  return [
    {
      id: "fornecedor",
      titulo: "Fornecedor",
      papel: "titulo",
      celula: (l) => (
        <Link href={`/fornecedores/${l.fornecedorId}`} className={LINK_DA_LINHA}>
          {l.fornecedorNome}
        </Link>
      ),
    },
    { id: "regime", titulo: "Regime", papel: "estado", celula: (l) => <RegimeFornecedorBadge regime={l.regime} /> },
    { id: "bruto", titulo: "Preço bruto", numerica: true, celula: (l) => `${formatarMoeda(l.brutoUnitCents)}/${grupo.unidade}` },
    {
      id: "credito",
      titulo: "Crédito",
      numerica: true,
      celula: (l) => (l.creditoUnitCents > 0 ? `− ${formatarMoeda(l.creditoUnitCents)}` : "—"),
    },
    {
      id: "efetivo",
      titulo: "Custo efetivo",
      papel: "valor",
      numerica: true,
      celula: (l) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          {grupo.inversao && l.fornecedorId === grupo.maisBaratoEfetivoId && <StatusBadge estado="no-prazo">Mais barato de verdade</StatusBadge>}
          {formatarMoeda(l.efetivoUnitCents)}/{grupo.unidade}
        </span>
      ),
    },
    { id: "compras", titulo: "Compras", numerica: true, celula: (l) => `${l.compras} · últ. ${formatarData(l.ultimaCompra)}` },
  ];
}

function Grupo({ grupo, mostrarUnidade }: { grupo: GrupoUnidade; mostrarUnidade: boolean }) {
  const porId = new Map(grupo.fornecedores.map((f) => [f.fornecedorId, f]));
  const baratoBruto = grupo.maisBaratoBrutoId ? porId.get(grupo.maisBaratoBrutoId) : undefined;
  const baratoEfetivo = grupo.maisBaratoEfetivoId ? porId.get(grupo.maisBaratoEfetivoId) : undefined;
  const pendentes = grupo.fornecedores.reduce((s, l) => s + l.itensClassificacaoPendente, 0);
  return (
    <div className="space-y-3">
      {mostrarUnidade && <h3 className="text-sm font-medium">Comprado em {grupo.unidade}</h3>}
      {grupo.modo === "NOMINAL_PERIODO_TESTE" && (
        <p className="text-sm text-muted-foreground">
          Todas as compras são de antes de 2027, quando o crédito de IBS/CBS ainda não vale. A comparação, por enquanto, é só pelo preço da nota.
        </p>
      )}
      {grupo.inversao && baratoBruto && baratoEfetivo && (
        <p role="status" className="rounded-md border-2 border-estado-atencao-borda bg-estado-atencao px-3 py-2 text-sm text-estado-atencao-fg">
          <strong>{baratoBruto.fornecedorNome}</strong> tem o menor preço na nota, mas <strong>{baratoEfetivo.fornecedorNome}</strong> sai{" "}
          {formatarMoeda(grupo.diferencaUnitCents)} mais barato por {grupo.unidade} depois do crédito.
        </p>
      )}
      <ListaDeDados
        legenda={`Custo efetivo por fornecedor, em ${grupo.unidade}`}
        linhas={grupo.fornecedores}
        chave={(l) => l.fornecedorId}
        colunas={colunas(grupo)}
      />
      {grupo.modo === "EFETIVO" && grupo.fornecedores.some((l) => l.regime === "NAO_IDENTIFICADO") && (
        <p className="text-xs text-muted-foreground">
          Regime não identificado: nota antiga ou lançada à mão, sem o regime do emitente. O crédito vale só se a nota trouxe IBS/CBS destacado.
        </p>
      )}
      {pendentes > 0 && (
        <p className="text-xs text-muted-foreground">
          {pendentes} item(ns) com IBS/CBS destacado, mas classificação tributária não reconhecida: o crédito deles está zerado até alguém conferir.
        </p>
      )}
    </div>
  );
}

export function CustoEfetivoCard({
  custo,
  materialId,
  admin,
}: {
  custo: CustoEfetivoDoMaterial;
  materialId: string;
  admin: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle>Quanto custa de verdade por fornecedor</CardTitle>
          <p className="text-sm text-muted-foreground">
            Preço médio por unidade desde {formatarData(custo.desde)}, ponderado pela quantidade. Custo efetivo é o preço menos o crédito de
            IBS/CBS que a empresa aproveita.
          </p>
        </div>
        <nav aria-label="Período" className="flex gap-1 text-sm">
          {PERIODOS_MESES.map((m) => (
            <Link
              key={m}
              href={`/materiais/${materialId}?meses=${m}`}
              aria-current={m === custo.meses ? "true" : undefined}
              className={m === custo.meses ? "rounded-sm border px-2 py-1 font-medium" : "rounded-sm px-2 py-1 text-muted-foreground underline underline-offset-2"}
            >
              {m} meses
            </Link>
          ))}
        </nav>
      </CardHeader>
      <CardContent className="space-y-4">
        <AvisoRegimeCredito regime={custo.regimeEmpresa} admin={admin} />
        {custo.grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem compras deste material nos últimos {custo.meses} meses.</p>
        ) : (
          custo.grupos.map((g) => <Grupo key={g.unidade} grupo={g} mostrarUnidade={custo.grupos.length > 1} />)
        )}
      </CardContent>
    </Card>
  );
}
