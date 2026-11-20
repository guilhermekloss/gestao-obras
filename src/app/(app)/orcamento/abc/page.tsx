import type { Metadata } from "next";
import type { TipoItem } from "@prisma/client";
import { LinkVoltar } from "@/components/link-voltar";
import { exigirPapel } from "@/lib/auth";
import { formatarMoeda, formatarPercentBp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listarObrasParaFiltro } from "@/services/obras";
import { carregarCurvaAbc, type ClasseAbc } from "@/services/analises";
import { carregarModoDoCusto } from "@/services/tributacao/custo-liquido-db";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { SelectNativo } from "@/components/select-nativo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";

export const metadata: Metadata = { title: "Curva ABC de insumos" };

const TIPOS: { value: TipoItem; label: string }[] = [
  { value: "MATERIAL", label: "Material" },
  { value: "SERVICO", label: "Serviço" },
  { value: "FRETE", label: "Frete" },
  { value: "ENCARGO", label: "Encargo" },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<TipoItem, string>;

const CLASSE_INFO: Record<ClasseAbc, { descricao: string; badge: "default" | "secondary" | "outline"; linha?: string }> = {
  // o insumo que cruza a linha fica na classe de cima (ver `classeAbc`)
  A: { descricao: "primeiros ~80% do custo", badge: "default", linha: "bg-[color-mix(in_oklab,var(--card),var(--primary)_6%)]" },
  B: { descricao: "próximos ~15%", badge: "secondary" },
  C: { descricao: "restante (~5%)", badge: "outline" },
};

const DATA_INPUT = /^\d{4}-\d{2}-\d{2}$/;

// início/fim do dia local
function dataDoFiltro(valor: string | undefined, fimDoDia: boolean): Date | undefined {
  if (!valor || !DATA_INPUT.test(valor)) return undefined;
  return new Date(`${valor}T${fimDoDia ? "23:59:59.999" : "00:00:00"}`);
}

function formatarQtde(qtde: number): string {
  return qtde.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export default async function CurvaAbcPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; de?: string; ate?: string; tipo?: string; custo?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { obra, de, ate, tipo: tipoParam, custo: custoParam } = await searchParams;
  const tipo = TIPOS.find((t) => t.value === tipoParam)?.value;

  // a opção só existe com crédito a recuperar; com ele, o líquido é o padrão (como no Orçamento). Fora do regime
  // regular a curva é sempre a bruta e as notas com destaque nem são lidas.
  const [obras, { comCredito, modo }] = await Promise.all([listarObrasParaFiltro(), carregarModoDoCusto(obra || undefined, custoParam)]);
  const curva = await carregarCurvaAbc({
    obraId: obra || undefined,
    de: dataDoFiltro(de, false),
    ate: dataDoFiltro(ate, true),
    tipo,
    liquido: modo === "LIQUIDO",
  });
  const { insumos, resumo, totalCents } = curva;
  const linhas = insumos.map((i, idx) => ({ ...i, ordem: idx + 1 }));

  // A primeira coluna (fixa ao rolar) leva posição, classe e nome: identifica o insumo sozinha.
  const colunas: ColunaDados<(typeof linhas)[number]>[] = [
    {
      id: "insumo",
      titulo: "Insumo",
      classe: "w-40 min-w-40 whitespace-normal tabela:w-64 tabela:min-w-64",
      celula: (i) => (
        // celular: nome em cima, posição e classe embaixo; tabela larga: tudo numa linha
        <span className="flex flex-col gap-1 tabela:flex-row tabela:items-start tabela:gap-2">
          <span className={cn("order-1 min-w-0 tabela:order-2", i.classe === "A" && "font-medium")}>
            {i.descricao}
          </span>
          <span className="order-2 flex items-center gap-2 tabela:order-1">
            <span className="num min-w-5 text-muted-foreground tabela:text-right">{i.ordem}º</span>
            <Badge variant={CLASSE_INFO[i.classe].badge} title={`Classe ${i.classe}`}>
              {i.classe}
            </Badge>
          </span>
        </span>
      ),
    },
    { id: "tipo", titulo: "Tipo", celula: (i) => TIPO_LABEL[i.tipo] },
    { id: "qtde", titulo: "Qtde", numerica: true, celula: (i) => `${formatarQtde(i.qtde)} ${i.unidade}` },
    {
      id: "preco",
      titulo: "Preço médio",
      numerica: true,
      celula: (i) => (i.precoMedioCents !== null ? `${formatarMoeda(i.precoMedioCents)}/${i.unidade}` : "—"),
    },
    { id: "fornecedores", titulo: "Fornec.", numerica: true, celula: (i) => i.numFornecedores },
    { id: "custo", titulo: "Custo", numerica: true, classe: "font-medium", celula: (i) => formatarMoeda(i.custoCents) },
    { id: "part", titulo: "Part.", numerica: true, celula: (i) => formatarPercentBp(i.participacaoBp) },
    {
      id: "acum",
      titulo: "Acum.",
      numerica: true,
      classe: "text-muted-foreground",
      celula: (i) => formatarPercentBp(i.acumuladoBp),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <LinkVoltar href={obra ? `/orcamento?obra=${obra}` : "/orcamento"}>Orçamento</LinkVoltar>
        <h1 className="text-2xl md:text-3xl">Curva ABC de insumos</h1>
        <p className="text-sm text-muted-foreground">
          Itens de nota agrupados por descrição e unidade, do maior custo para o menor.
          Com obra selecionada, entra só a parte rateada para ela.
          {modo === "LIQUIDO" && " O custo de cada insumo é líquido do crédito de IBS/CBS."}
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="filtro-obra" className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            id="filtro-obra"
            name="obra"
            defaultValue={obra ?? ""}
            todosLabel="Todas"
            placeholder="Todas"
            className="w-44"
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="filtro-de" className="text-xs text-muted-foreground">De</label>
          <Input type="date" id="filtro-de" name="de" defaultValue={de ?? ""} className="w-36" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="filtro-ate" className="text-xs text-muted-foreground">Até</label>
          <Input type="date" id="filtro-ate" name="ate" defaultValue={ate ?? ""} className="w-36" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="filtro-tipo" className="text-xs text-muted-foreground">Tipo</label>
          <SelectNativo id="filtro-tipo" name="tipo" defaultValue={tipo ?? ""} className="w-36">
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectNativo>
        </div>
        {comCredito && (
          <div className="grid gap-1">
            <label htmlFor="filtro-custo" className="text-xs text-muted-foreground">Custo</label>
            <SelectNativo id="filtro-custo" name="custo" defaultValue={modo === "LIQUIDO" ? "liquido" : "bruto"} className="w-44">
              <option value="liquido">Líquido de IBS/CBS</option>
              <option value="bruto">Bruto</option>
            </SelectNativo>
          </div>
        )}
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["A", "B", "C"] as const).map((c) => (
          <Card key={c}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Badge variant={CLASSE_INFO[c].badge}>Classe {c}</Badge>
                <span className="text-xs text-muted-foreground">{CLASSE_INFO[c].descricao}</span>
              </div>
              <p className="mt-2 text-2xl num">
                {resumo[c].itens} <span className="text-sm font-normal text-muted-foreground">insumo(s)</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatarPercentBp(resumo[c].participacaoBp)} do custo · {formatarMoeda(resumo[c].custoCents)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {insumos.length} insumo(s) · custo {modo === "LIQUIDO" ? "líquido " : ""}total {formatarMoeda(totalCents)}
      </p>

      <ListaDeDados
        modo="rolagem"
        legenda="Curva ABC de insumos"
        linhas={linhas}
        chave={(i) => i.chave}
        colunas={colunas}
        classeDaLinha={(i) => CLASSE_INFO[i.classe].linha}
        vazio="Nenhum item de nota no filtro escolhido."
      />
    </div>
  );
}
