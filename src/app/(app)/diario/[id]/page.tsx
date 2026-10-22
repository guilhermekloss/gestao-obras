import type { Metadata } from "next";
import { formatarCno } from "@/services/cno";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { podeVerObra } from "@/services/acesso";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { formatarData } from "@/lib/format";
import {
  dataDoRdo,
  normalizarEfetivo,
  normalizarEquipamentos,
  podeAlterarRdo,
  rotuloClima,
  totalPessoas,
} from "@/services/rdo";
import { excluirRdo } from "../actions";
import { CondicaoBadge } from "../condicao-badge";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

// seletores amplos são seguros: esta página não usa <nav>/<header> no conteúdo.
// String crua (dangerouslySetInnerHTML) para o React não escapar o CSS.

export const metadata: Metadata = { title: "RDO" };
const CSS_IMPRESSAO = `
@media print {
  @page { size: A4; margin: 12mm 14mm; }
  html, body { background: #fff !important; }
  body nav, body header, [data-sonner-toaster] { display: none !important; }
  main { padding: 0 !important; }
}
`;

export default async function RdoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await exigirPapel();
  const { id } = await params;

  const rdo = await prisma.diarioObra.findUnique({
    where: { id },
    include: {
      obra: { select: { id: true, nome: true, codigo: true, cno: true, endereco: true } },
      autor: { select: { nome: true } },
      fotos: { orderBy: { id: "asc" } },
    },
  });
  if (!rdo || !podeVerObra(user.obrasPermitidas, rdo.obraId)) notFound();

  const dia = dataDoRdo(rdo.data);
  const efetivo = normalizarEfetivo(rdo.efetivo);
  const equipamentos = normalizarEquipamentos(rdo.equipamentos);
  const total = totalPessoas(efetivo);
  const podeAlterar = podeAlterarRdo(user, rdo);
  const climaManha = rotuloClima(rdo.climaManha);
  const climaTarde = rotuloClima(rdo.climaTarde);
  const alterado = rdo.updatedAt.getTime() - rdo.createdAt.getTime() > 60_000;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESSAO }} />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" render={<Link href={`/diario?obra=${rdo.obra.id}`} />}>
          <ArrowLeft className="size-4" /> Diário
        </Button>
        <div className="flex flex-wrap gap-2">
          <BotaoImprimir />
          {podeAlterar && (
            <>
              <Button variant="outline" size="sm" render={<Link href={`/diario/${rdo.id}/editar`} />}>
                <Pencil className="size-4" /> Editar
              </Button>
              <ConfirmButton
                action={excluirRdo.bind(null, rdo.id, `/diario?obra=${rdo.obra.id}`)}
                mensagem={`Excluir o RDO de ${formatarData(dia)}?`}
              >
                <Trash2 className="size-4" /> Excluir
              </ConfirmButton>
            </>
          )}
        </div>
      </div>

      <article className="space-y-5 rounded-lg border bg-card p-5 text-card-foreground print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Relatório Diário de Obra (RDO)
            </p>
            <h1 className="text-2xl md:text-3xl">{rdo.obra.nome}</h1>
            <p className="text-sm text-muted-foreground">
              Código {rdo.obra.codigo}
              {rdo.obra.cno ? ` · CNO ${formatarCno(rdo.obra.cno)}` : ""}
              {rdo.obra.endereco ? ` · ${rdo.obra.endereco}` : ""}
            </p>
          </div>
          <div className="sm:text-right print:text-right">
            <p className="text-lg font-semibold">{formatarData(dia)}</p>
            <p className="text-sm text-muted-foreground">{diaDaSemana(dia)}</p>
          </div>
        </div>

        <Secao titulo="Condições do dia">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Campo rotulo="Clima — manhã" valor={climaManha} />
            <Campo rotulo="Clima — tarde" valor={climaTarde} />
            <div>
              <dt className="text-xs text-muted-foreground">Condição de trabalho</dt>
              <dd className="mt-0.5">
                {rdo.condicao ? <CondicaoBadge condicao={rdo.condicao} /> : "—"}
              </dd>
            </div>
            {rdo.clima && (
              <Campo rotulo="Clima (registro antigo)" valor={rdo.clima} className="col-span-full" />
            )}
          </dl>
        </Secao>

        <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <Secao titulo={`Efetivo${total > 0 ? ` — ${total} ${total === 1 ? "pessoa" : "pessoas"}` : ""}`}>
            <TabelaContagem
              cabecalho="Função"
              linhas={efetivo.map((e) => ({ nome: e.funcao, qtd: e.qtd }))}
              vazio="Efetivo não informado."
            />
          </Secao>
          <Secao titulo="Equipamentos">
            <TabelaContagem cabecalho="Equipamento" linhas={equipamentos} vazio="Nenhum equipamento informado." />
          </Secao>
        </div>

        <Secao titulo="Atividades executadas">
          <p className="whitespace-pre-wrap text-sm">{rdo.atividades}</p>
        </Secao>

        <Secao titulo="Ocorrências">
          {rdo.ocorrencias ? (
            <p className="whitespace-pre-wrap text-sm">{rdo.ocorrencias}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem ocorrências.</p>
          )}
        </Secao>

        {rdo.fotos.length > 0 && (
          <Secao titulo={`Fotos (${rdo.fotos.length})`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-2">
              {rdo.fotos.map((f, i) => (
                <figure key={f.id} className="break-inside-avoid space-y-1">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt={f.legenda ?? `Foto ${i + 1} do RDO`}
                      className="aspect-[4/3] w-full rounded-md border object-cover print:rounded-none"
                    />
                  </a>
                  <figcaption className="text-xs text-muted-foreground">
                    Foto {i + 1}
                    {f.legenda ? ` — ${f.legenda}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Secao>
        )}

        <footer className="break-inside-avoid space-y-6 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Registrado por {rdo.autor?.nome ?? "—"} em{" "}
            {format(rdo.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            {alterado &&
              ` · última alteração em ${format(rdo.updatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
          </p>
          <div className="grid gap-8 pt-6 sm:grid-cols-2 print:grid-cols-2">
            <Assinatura legenda="Responsável pela obra" />
            <Assinatura legenda="Fiscalização / cliente (opcional)" />
          </div>
        </footer>
      </article>
    </div>
  );
}

// não usa `capitalize` do CSS: daria "Segunda-Feira"
function diaDaSemana(dia: Date): string {
  const nome = format(dia, "EEEE", { locale: ptBR });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 font-medium">{valor ?? "—"}</dd>
    </div>
  );
}

function TabelaContagem({
  cabecalho,
  linhas,
  vazio,
}: {
  cabecalho: string;
  linhas: { nome: string; qtd: number }[];
  vazio: string;
}) {
  if (linhas.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="py-1 font-medium">{cabecalho}</th>
          <th className="w-16 py-1 text-right font-medium">Qtd.</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.nome} className="border-b last:border-0">
            <td className="py-1">{l.nome}</td>
            <td className="py-1 text-right tabular-nums">{l.qtd}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Assinatura({ legenda }: { legenda: string }) {
  return (
    <div className="space-y-1 text-center">
      <div className="h-10 border-b border-foreground/60" />
      <p className="text-xs">{legenda}</p>
    </div>
  );
}
