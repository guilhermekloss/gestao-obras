"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { Building2, CornerDownLeft, FilePlus2, LayoutGrid, Package, ReceiptText, Search, Truck, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buscarGlobal } from "@/app/(app)/busca/actions";
import {
  atalhosPara,
  emSecoes,
  filtrarAtalhos,
  ROTULO_TIPO,
  type ResultadoBusca,
  type TipoResultado,
} from "@/components/busca-global-model";

const ICONE: Record<TipoResultado, LucideIcon> = {
  acao: FilePlus2,
  tela: LayoutGrid,
  obra: Building2,
  fornecedor: Truck,
  lancamento: ReceiptText,
  material: Package,
};

/** Busca do cabeçalho: abre com Ctrl+K (ou ⌘K), acha telas, ações e registros e leva direto a eles. */
export function BuscaGlobal({ role }: { role: Role }) {
  const router = useRouter();
  const idLista = useId();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [registros, setRegistros] = useState<ResultadoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const [mac, setMac] = useState(false);

  const atalhos = useMemo(() => atalhosPara(role), [role]);
  const resultados = useMemo(() => [...filtrarAtalhos(atalhos, termo), ...registros], [atalhos, termo, registros]);
  const secoes = useMemo(() => emSecoes(resultados), [resultados]);
  const total = resultados.length;
  const ativo = Math.min(destaque, Math.max(0, total - 1));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)));
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((a) => !a);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  // busca no banco com pausa; resposta de um termo antigo é descartada
  useEffect(() => {
    const t = termo.trim();
    if (!aberto || t.length < 2) return;
    let cancelado = false;
    const espera = setTimeout(() => {
      setBuscando(true);
      buscarGlobal(t)
        .then((r) => {
          if (!cancelado) setRegistros(r);
        })
        .catch(() => {
          if (!cancelado) setRegistros([]);
        })
        .finally(() => {
          if (!cancelado) setBuscando(false);
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [termo, aberto]);

  function mudarTermo(valor: string) {
    setTermo(valor);
    setDestaque(0);
    if (valor.trim().length < 2) {
      setRegistros([]);
      setBuscando(false);
    }
  }

  function mudarAberto(novo: boolean) {
    setAberto(novo);
    if (!novo) {
      setTermo("");
      setRegistros([]);
      setDestaque(0);
    }
  }

  function ir(r: ResultadoBusca) {
    mudarAberto(false);
    router.push(r.href);
  }

  function mover(para: number) {
    if (total === 0) return;
    const novo = (para + total) % total;
    setDestaque(novo);
    requestAnimationFrame(() =>
      listaRef.current?.querySelector(`[data-indice="${novo}"]`)?.scrollIntoView({ block: "nearest" }),
    );
  }

  function aoTeclarNoCampo(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      mover(ativo + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      mover(ativo - 1);
    } else if (e.key === "Enter" && resultados[ativo]) {
      e.preventDefault();
      ir(resultados[ativo]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Buscar"
        aria-haspopup="dialog"
        data-assistente="busca"
        className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-md border border-transparent px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground md:w-64 md:justify-start md:border-border md:bg-background md:px-3 pointer-coarse:h-11 pointer-coarse:min-w-11"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left md:inline">Buscar ou ir para…</span>
        <kbd className="hidden rounded-sm border bg-card px-1.5 font-sans text-xs md:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <Dialog open={aberto} onOpenChange={mudarAberto}>
        <DialogContent
          showCloseButton={false}
          className="top-[8svh] max-h-[80svh] translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="flex items-center gap-3 border-b px-4">
            <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <input
              role="combobox"
              aria-label="Buscar telas, obras, fornecedores, lançamentos e materiais"
              aria-expanded
              aria-controls={idLista}
              aria-activedescendant={total > 0 ? `${idLista}-${ativo}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              value={termo}
              onChange={(e) => mudarTermo(e.target.value)}
              onKeyDown={aoTeclarNoCampo}
              placeholder="Obra, fornecedor, nota, material…"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div ref={listaRef} id={idLista} role="listbox" aria-label="Resultados" className="overflow-y-auto p-2">
            {secoes.map((secao) => (
              <div key={secao.tipo} role="group" aria-label={ROTULO_TIPO[secao.tipo]} className="pb-1">
                <p aria-hidden className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {ROTULO_TIPO[secao.tipo]}
                </p>
                {secao.itens.map((r) => {
                  const Icone = ICONE[r.tipo];
                  const marcado = r.indice === ativo;
                  return (
                    <div
                      key={`${r.tipo}:${r.href}`}
                      id={`${idLista}-${r.indice}`}
                      role="option"
                      aria-selected={marcado}
                      data-indice={r.indice}
                      onClick={() => ir(r)}
                      onPointerMove={() => setDestaque(r.indice)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                        marcado && "bg-nav-ativo",
                      )}
                    >
                      <Icone aria-hidden className={cn("size-4.5 shrink-0", marcado ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.titulo}</span>
                        {r.detalhe && <span className="block truncate text-xs text-muted-foreground">{r.detalhe}</span>}
                      </span>
                      {marcado && <CornerDownLeft aria-hidden className="hidden size-4 shrink-0 text-muted-foreground md:block" />}
                    </div>
                  );
                })}
              </div>
            ))}
            {total === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {buscando ? "Buscando…" : `Nada encontrado para “${termo.trim()}”.`}
              </p>
            )}
          </div>

          <p role="status" className="border-t px-4 py-2 text-xs text-muted-foreground">
            <span className="sr-only">
              {buscando ? "Buscando. " : `${total} ${total === 1 ? "resultado" : "resultados"}. `}
            </span>
            <span aria-hidden className="hidden md:inline">↑↓ escolher · Enter abrir · Esc fechar</span>
            <span aria-hidden className="md:hidden">Toque para abrir</span>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
