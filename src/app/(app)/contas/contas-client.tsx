"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarraDeAcao } from "@/components/barra-de-acao";
import { ConfirmarDialog } from "@/components/confirmar-dialog";
import { StatusBadge } from "@/components/status-badge";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { formatarMoeda, formatarData } from "@/lib/format";
import { TIPO_DOCUMENTO_BADGE, TIPO_DOCUMENTO_LABELS } from "@/services/financeiro";
import type { TipoDocumento } from "@prisma/client";
import { pagarParcelas, reabrirParcela } from "./actions";
import { CheckCheck, OctagonAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { ordenarPorUrgencia, resumoDeVencidas, rotuloDeUrgencia, textoVencidaHa } from "./urgencia";

export type ParcelaLinha = {
  id: string;
  vencimento: string;
  valorCents: number;
  numero: number;
  totalParcelas: number;
  status: "ABERTA" | "PAGA";
  pagaEm: string | null;
  vencida: boolean;
  /** Dias de calendário até o vencimento (negativo = já venceu). */
  diasParaVencer: number;
  fornecedor: string;
  notaId: string;
  notaNumero: string;
  tipoDocumento: TipoDocumento;
  obras: string;
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
// o diálogo lista só as primeiras; o resto vira "e mais N"
const MAX_NO_DIALOGO = 5;

export function ContasTable({ parcelas }: { parcelas: ParcelaLinha[] }) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, startTransition] = useTransition();

  // mais atrasadas no topo: a ordem da lista é a ordem do que precisa de atenção
  const linhas = useMemo(() => ordenarPorUrgencia(parcelas), [parcelas]);
  const abertas = linhas.filter((p) => p.status === "ABERTA");
  const todasSelecionadas = abertas.length > 0 && abertas.every((p) => selecionadas.has(p.id));
  const vencidas = resumoDeVencidas(linhas);

  const escolhidas = linhas.filter((p) => selecionadas.has(p.id));
  const totalSelecionado = escolhidas.reduce((acc, p) => acc + p.valorCents, 0);
  const vencidasEscolhidas = escolhidas.filter((p) => p.vencida).length;

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pagarSelecionadas() {
    const ids = [...selecionadas];
    startTransition(async () => {
      const res = await pagarParcelas(ids);
      if (res.ok) {
        toast.success(
          `${ids.length} ${plural(ids.length, "parcela marcada como paga", "parcelas marcadas como pagas")}`,
        );
        setSelecionadas(new Set());
      } else {
        toast.error(res.erro ?? "Erro");
      }
      setConfirmando(false);
    });
  }

  function alternarTodas() {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(abertas.map((p) => p.id)));
  }

  function selecionarVencidas() {
    setSelecionadas(new Set(abertas.filter((p) => p.vencida).map((p) => p.id)));
  }

  const colunas: ColunaDados<ParcelaLinha>[] = [
    {
      id: "selecao",
      titulo: "Selecionar",
      papel: "selecao",
      tituloOculto: true,
      classeCabecalho: "w-10",
      cabecalho: (
        <label className="-m-2 flex size-10 cursor-pointer items-center justify-center cartao:hidden">
          <input
            type="checkbox"
            aria-label="Selecionar todas"
            className="size-4 pointer-coarse:size-6"
            checked={todasSelecionadas}
            onChange={alternarTodas}
          />
        </label>
      ),
      celula: (p) =>
        p.status === "ABERTA" ? (
          <label className="-m-2 flex size-10 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Selecionar parcela ${p.numero}/${p.totalParcelas} de ${p.fornecedor}`}
              className="size-4 pointer-coarse:size-6"
              checked={selecionadas.has(p.id)}
              onChange={() => toggle(p.id)}
            />
          </label>
        ) : (
          // mantém o recuo do título igual ao das parcelas abertas
          <span aria-hidden className="block size-6" />
        ),
    },
    {
      id: "vencimento",
      titulo: "Vencimento",
      celula: (p) => (
        <span className={p.vencida ? "font-bold text-estado-vencido-fg" : undefined}>
          {formatarData(p.vencimento)}
        </span>
      ),
    },
    {
      id: "fornecedor",
      titulo: "Fornecedor",
      papel: "titulo",
      classe: "tabela:font-medium",
      celula: (p) => (
        <Link href={`/notas/${p.notaId}`} className={LINK_DA_LINHA}>
          {p.fornecedor}
        </Link>
      ),
    },
    {
      id: "documento",
      titulo: "Documento",
      celula: (p) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge
            variant={p.tipoDocumento === "NF" ? "outline" : "secondary"}
            title={TIPO_DOCUMENTO_LABELS[p.tipoDocumento]}
          >
            {TIPO_DOCUMENTO_BADGE[p.tipoDocumento]}
          </Badge>
          {p.notaNumero}
        </span>
      ),
    },
    {
      id: "obras",
      titulo: "Obras",
      classe: "tabela:max-w-48 tabela:truncate",
      celula: (p) => p.obras || null,
    },
    { id: "parcela", titulo: "Parcela", celula: (p) => `${p.numero}/${p.totalParcelas}` },
    {
      id: "status",
      titulo: "Situação",
      papel: "estado",
      celula: (p) => {
        const { estado, texto } = rotuloDeUrgencia(p);
        return <StatusBadge estado={estado}>{texto}</StatusBadge>;
      },
    },
    {
      id: "valor",
      titulo: "Valor",
      papel: "valor",
      numerica: true,
      classe: "tabela:text-base",
      celula: (p) => formatarMoeda(p.valorCents),
    },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      classeCabecalho: "w-10",
      celula: (p) =>
        p.status === "PAGA" ? (
          <Button
            variant="ghost"
            title="Reabrir parcela"
            // celular: botão com texto; desktop: só o ícone, como os outros botões de ícone
            className="tabela:size-8 tabela:px-0 tabela:pointer-coarse:size-10"
            onClick={() =>
              startTransition(async () => {
                const res = await reabrirParcela(p.id);
                if (res.ok) toast.success("Parcela reaberta");
                else toast.error(res.erro ?? "Erro");
              })
            }
          >
            <Undo2 className="size-4 text-muted-foreground" />
            <span className="tabela:sr-only">Reabrir parcela</span>
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <div className="@container space-y-3">
        {vencidas && (
          <section
            aria-label="Parcelas vencidas"
            className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-estado-vencido-borda bg-estado-vencido p-3 text-estado-vencido-fg"
          >
            <OctagonAlert aria-hidden className="size-7 shrink-0" />
            <div className="min-w-0 flex-[1_1_14rem]">
              <p className="font-bold">
                {vencidas.quantidade} {plural(vencidas.quantidade, "parcela vencida", "parcelas vencidas")} ·{" "}
                <span className="num">{formatarMoeda(vencidas.totalCents)}</span>
              </p>
              <p className="text-sm">
                A mais antiga venceu {textoVencidaHa(vencidas.maisAntigaDias)}. Ficam no topo, da mais atrasada
                para a menos.
              </p>
            </div>
            <Button type="button" variant="outline" className="w-full bg-card sm:w-auto" onClick={selecionarVencidas}>
              Selecionar vencidas
            </Button>
          </section>
        )}

        {abertas.length > 0 && (
          // o cabeçalho da tabela some no celular; este controle ocupa o lugar dele
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm tabela:hidden">
            <input
              type="checkbox"
              className="size-6"
              checked={todasSelecionadas}
              onChange={alternarTodas}
            />
            Selecionar todas as abertas
          </label>
        )}

        <ListaDeDados
          legenda="Parcelas"
          linhas={linhas}
          chave={(p) => p.id}
          colunas={colunas}
          classeDaLinha={(p) =>
            p.vencida ? "bg-estado-vencido/40 shadow-[inset_4px_0_0_var(--estado-vencido-borda)]" : undefined
          }
          vazio="Nenhuma parcela nesta visão."
        />
      </div>

      {selecionadas.size > 0 && (
        <>
          {/* folga para a última parcela não ficar atrás da barra fixa do celular */}
          <div aria-hidden className="h-20 md:hidden" />
          {/* fora do contêiner da lista: `container-type` prenderia a barra fixa dentro dele */}
          <BarraDeAcao className="animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div role="status" aria-live="polite" className="min-w-0">
                <p className="font-medium">
                  {selecionadas.size} {plural(selecionadas.size, "parcela selecionada", "parcelas selecionadas")}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="num">{formatarMoeda(totalSelecionado)}</span>
                  {vencidasEscolhidas > 0 &&
                    ` · ${vencidasEscolhidas} ${plural(vencidasEscolhidas, "vencida", "vencidas")}`}
                </p>
              </div>
              <div className="flex w-full gap-2 md:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="md:flex-none"
                  disabled={pendente}
                  onClick={() => setSelecionadas(new Set())}
                >
                  Limpar
                </Button>
                <Button
                  type="button"
                  className="flex-1 md:flex-none"
                  disabled={pendente}
                  onClick={() => setConfirmando(true)}
                >
                  <CheckCheck className="size-4" />
                  Marcar como pagas
                </Button>
              </div>
            </div>
          </BarraDeAcao>
        </>
      )}

      <ConfirmarDialog
        aberto={confirmando && selecionadas.size > 0}
        onAbertoChange={setConfirmando}
        titulo={`Marcar ${selecionadas.size} ${plural(selecionadas.size, "parcela como paga", "parcelas como pagas")}?`}
        descricao={
          <>
            Total de <span className="num font-medium text-foreground">{formatarMoeda(totalSelecionado)}</span>. Se
            marcar errado, dá para reabrir a parcela depois.
          </>
        }
        confirmar="Confirmar pagamento"
        pendente={pendente}
        pendenteRotulo="Salvando..."
        onConfirmar={pagarSelecionadas}
      >
        <ul className="divide-y rounded-lg border text-sm">
          {escolhidas.slice(0, MAX_NO_DIALOGO).map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.fornecedor}</span>
                <span className="block text-muted-foreground">
                  Parcela {p.numero}/{p.totalParcelas} · {rotuloDeUrgencia(p).texto.toLowerCase()}
                </span>
              </span>
              <span className="num shrink-0">{formatarMoeda(p.valorCents)}</span>
            </li>
          ))}
          {escolhidas.length > MAX_NO_DIALOGO && (
            <li className="px-3 py-2 text-muted-foreground">
              e mais {escolhidas.length - MAX_NO_DIALOGO} {plural(escolhidas.length - MAX_NO_DIALOGO, "parcela", "parcelas")}
            </li>
          )}
        </ul>
      </ConfirmarDialog>
    </>
  );
}
