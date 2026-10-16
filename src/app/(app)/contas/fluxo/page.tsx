import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fluxoMensal } from "@/services/financeiro";
import { formatarMoeda, rotuloChaveMes } from "@/lib/format";
import { listarObrasParaFiltro } from "@/services/obras";
import { ArrowLeft, ChartNoAxesColumn, ReceiptText } from "lucide-react";
import { AcaoVazio, EstadoVazio } from "@/components/estado-vazio";
import { veFinanceiro } from "@/services/acesso";

export default async function FluxoMensalPage() {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");

  const [parcelas, obras] = await Promise.all([
    prisma.parcela.findMany({
      include: {
        nota: { include: { rateios: true } },
      },
    }),
    listarObrasParaFiltro(),
  ]);

  const nomeObra = new Map(obras.map((o) => [o.id, o.nome]));

  const fluxo = fluxoMensal(
    parcelas.map((p) => ({
      valorCents: p.valorCents,
      vencimento: p.vencimento,
      rateios: p.nota.rateios.map((r) => ({
        obraId: r.obraId,
        fracaoBp: r.fracaoBp,
      })),
    })),
  );

  const obrasOrdenadas = [...fluxo.obras].sort((a, b) =>
    (nomeObra.get(a) ?? "").localeCompare(nomeObra.get(b) ?? ""),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/contas" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl md:text-3xl">Fluxo mensal por obra</h1>
      </div>

      {fluxo.meses.length === 0 ? (
        <EstadoVazio
          icone={ChartNoAxesColumn}
          titulo="Fluxo sem parcelas"
          acao={
            veFinanceiro(user.role) && (
              <AcaoVazio href="/notas/nova" icone={ReceiptText}>
                Lançar primeira nota
              </AcaoVazio>
            )
          }
        >
          O fluxo soma o que vence a cada mês, por obra. Ele aparece com a primeira nota parcelada.
        </EstadoVazio>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                {obrasOrdenadas.map((id) => (
                  <TableHead key={id} className="text-right">
                    {nomeObra.get(id) ?? id}
                  </TableHead>
                ))}
                <TableHead className="text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fluxo.meses.map((mes) => (
                <TableRow key={mes}>
                  <TableCell className="font-medium">{rotuloChaveMes(mes)}</TableCell>
                  {obrasOrdenadas.map((id) => {
                    const v = fluxo.valores[mes][id] ?? 0;
                    return (
                      <TableCell key={id} className="text-right">
                        {v ? formatarMoeda(v) : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-semibold">
                    {formatarMoeda(fluxo.totalPorMes[mes] ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50">
                <TableCell className="font-semibold">Total</TableCell>
                {obrasOrdenadas.map((id) => (
                  <TableCell key={id} className="text-right font-semibold">
                    {formatarMoeda(fluxo.totalPorObra[id] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold">
                  {formatarMoeda(
                    Object.values(fluxo.totalPorMes).reduce((a, b) => a + b, 0),
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
