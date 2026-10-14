import Link from "next/link";
import type { TipoItem } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { exigirPapel } from "@/lib/auth";
import { formatarMoeda, formatarPercentBp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listarObrasParaFiltro } from "@/services/obras";
import { carregarCurvaAbc, type ClasseAbc } from "@/services/analises";
import { ComboboxFiltro } from "@/components/combobox-filtro";
import { SelectNativo } from "@/components/select-nativo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TIPOS: { value: TipoItem; label: string }[] = [
  { value: "MATERIAL", label: "Material" },
  { value: "SERVICO", label: "Serviço" },
  { value: "FRETE", label: "Frete" },
  { value: "ENCARGO", label: "Encargo" },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<TipoItem, string>;

const CLASSE_INFO: Record<ClasseAbc, { descricao: string; badge: "default" | "secondary" | "outline"; linha?: string }> = {
  // o insumo que cruza a linha fica na classe de cima (ver `classeAbc`)
  A: { descricao: "primeiros ~80% do custo", badge: "default", linha: "bg-primary/5" },
  B: { descricao: "próximos ~15%", badge: "secondary" },
  C: { descricao: "restante (~5%)", badge: "outline" },
};

const DATA_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/** "aaaa-mm-dd" do filtro → início/fim do dia local; valor inválido é ignorado. */
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
  searchParams: Promise<{ obra?: string; de?: string; ate?: string; tipo?: string }>;
}) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { obra, de, ate, tipo: tipoParam } = await searchParams;
  const tipo = TIPOS.find((t) => t.value === tipoParam)?.value;

  const [obras, curva] = await Promise.all([
    listarObrasParaFiltro(),
    carregarCurvaAbc({
      obraId: obra || undefined,
      de: dataDoFiltro(de, false),
      ate: dataDoFiltro(ate, true),
      tipo,
    }),
  ]);
  const { insumos, resumo, totalCents } = curva;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href={obra ? `/orcamento?obra=${obra}` : "/orcamento"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Orçamento
        </Link>
        <h1 className="text-2xl font-semibold">Curva ABC de insumos</h1>
        <p className="text-sm text-muted-foreground">
          Itens de nota agrupados por descrição e unidade, do maior custo para o menor.
          Com obra selecionada, entra só a parte rateada para ela.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Obra</label>
          <ComboboxFiltro
            name="obra"
            defaultValue={obra ?? ""}
            todosLabel="Todas"
            placeholder="Todas"
            className="w-44"
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" name="de" defaultValue={de ?? ""} className="w-36" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" name="ate" defaultValue={ate ?? ""} className="w-36" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <SelectNativo name="tipo" defaultValue={tipo ?? ""} className="w-36">
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectNativo>
        </div>
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
              <p className="mt-2 text-2xl font-semibold">
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
        {insumos.length} insumo(s) · custo total {formatarMoeda(totalCents)}
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Insumo</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <TableHead className="hidden text-right md:table-cell">Qtde</TableHead>
              <TableHead className="hidden text-right md:table-cell">Preço médio</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Fornec.</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Part.</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Acum.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {insumos.map((i, idx) => (
              <TableRow key={i.chave} className={CLASSE_INFO[i.classe].linha}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>
                  <Badge variant={CLASSE_INFO[i.classe].badge}>{i.classe}</Badge>
                </TableCell>
                <TableCell className={cn("max-w-48 truncate md:max-w-none", i.classe === "A" && "font-medium")}>
                  {i.descricao}
                </TableCell>
                <TableCell className="hidden md:table-cell">{TIPO_LABEL[i.tipo]}</TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {formatarQtde(i.qtde)} {i.unidade}
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {i.precoMedioCents !== null ? `${formatarMoeda(i.precoMedioCents)}/${i.unidade}` : "—"}
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">{i.numFornecedores}</TableCell>
                <TableCell className="text-right font-medium">{formatarMoeda(i.custoCents)}</TableCell>
                <TableCell className="text-right">{formatarPercentBp(i.participacaoBp)}</TableCell>
                <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                  {formatarPercentBp(i.acumuladoBp)}
                </TableCell>
              </TableRow>
            ))}
            {insumos.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Nenhum item de nota no filtro escolhido.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
