"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Tour as TourTipo } from "@/services/assistente";
import { elementoVisivel, passosVisiveis } from "./passos";

type Medida = { top: number; left: number; width: number; height: number; janelaL: number; janelaA: number };

const LARGURA_CARTAO = 352;
const FOLGA = 6;

function reduzMovimento() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Tour({
  tour,
  aoEncerrar,
  retorno,
}: {
  tour: TourTipo;
  aoEncerrar: () => void;
  /** Elemento que recebe o foco quando o tour fecha. */
  retorno?: React.RefObject<HTMLElement | null>;
}) {
  // calculado uma vez, quando o tour abre: o que está oculto agora (menu duplicado, "Mais" fechado) é pulado
  const [passos] = useState(() => passosVisiveis(tour.passos, (s) => elementoVisivel(s) !== null));
  const [indice, setIndice] = useState(0);
  const [medida, setMedida] = useState<Medida | null>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const anterior = useRef<HTMLElement | null>(null);
  const aoEncerrarRef = useRef(aoEncerrar);
  useEffect(() => {
    aoEncerrarRef.current = aoEncerrar;
  });

  const passo = passos[indice];
  const ultimo = indice === passos.length - 1;

  const medir = useCallback(() => {
    const alvo = passo?.alvo ? elementoVisivel(passo.alvo) : null;
    if (!alvo) {
      setMedida(null);
      return;
    }
    const r = alvo.getBoundingClientRect();
    setMedida({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      janelaL: window.innerWidth,
      janelaA: window.innerHeight,
    });
  }, [passo]);

  // leva o alvo ao centro da tela e mede; sem alvo, cartão centralizado
  useLayoutEffect(() => {
    const alvo = passo?.alvo ? elementoVisivel(passo.alvo) : null;
    alvo?.scrollIntoView({ block: "center", inline: "nearest", behavior: reduzMovimento() ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a medida vem do DOM, só existe depois do desenho
    medir();
  }, [passo, medir]);

  useEffect(() => {
    let quadro = 0;
    const agendar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    };
    window.addEventListener("resize", agendar);
    window.addEventListener("scroll", agendar, true);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", agendar);
      window.removeEventListener("scroll", agendar, true);
    };
  }, [medir]);

  // o foco acompanha o cartão a cada passo
  useEffect(() => {
    cartao.current?.focus({ preventScroll: true });
  }, [indice]);

  useEffect(() => {
    if (passos.length === 0) aoEncerrarRef.current();
  }, [passos.length]);

  // ao fechar, o foco volta para onde estava (ou para o botão do assistente, se o foco estava solto)
  useEffect(() => {
    const ativo = document.activeElement as HTMLElement | null;
    anterior.current = ativo && ativo !== document.body && !ativo.closest("[role=dialog]") ? ativo : null;
    const botao = retorno?.current;
    return () => {
      const voltar = anterior.current?.isConnected ? anterior.current : botao;
      voltar?.focus({ preventScroll: true });
    };
  }, [retorno]);

  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        aoEncerrarRef.current();
      }
    };
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, []);

  if (!passo) return null;

  const pequena = (medida?.janelaL ?? window.innerWidth) < 640;
  let estilo: React.CSSProperties;
  if (!medida) {
    estilo = pequena
      ? { left: "1rem", right: "1rem", bottom: "calc(var(--altura-bottom-nav,0px) + 0.75rem)" }
      : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: LARGURA_CARTAO };
  } else if (pequena) {
    const noAlto = medida.top + medida.height / 2 > medida.janelaA / 2;
    estilo = noAlto
      ? { left: "1rem", right: "1rem", top: "4rem" }
      : { left: "1rem", right: "1rem", bottom: "calc(var(--altura-bottom-nav,0px) + 0.75rem)" };
  } else {
    const esquerda = Math.min(Math.max(16, medida.left), medida.janelaL - LARGURA_CARTAO - 16);
    const abaixo = medida.janelaA - (medida.top + medida.height);
    estilo =
      abaixo >= 260 || abaixo >= medida.top
        ? { left: esquerda, top: Math.min(medida.top + medida.height + 12, medida.janelaA - 240), width: LARGURA_CARTAO }
        : { left: esquerda, bottom: medida.janelaA - medida.top + 12, width: LARGURA_CARTAO };
  }

  return (
    <>
      {medida && (
        <div
          aria-hidden
          data-assistente="tour-destaque"
          className="pointer-events-none fixed z-[59] rounded-md border-2 border-primary ring-2 ring-background"
          style={{
            top: medida.top - FOLGA,
            left: medida.left - FOLGA,
            width: medida.width + FOLGA * 2,
            height: medida.height + FOLGA * 2,
          }}
        />
      )}
      <div
        ref={cartao}
        role="region"
        aria-label="Tour guiado"
        tabIndex={-1}
        data-assistente="tour"
        className="fixed z-[60] grid gap-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={estilo}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Passo {indice + 1} de {passos.length}
          </p>
          <Button type="button" variant="outline" size="lg" onClick={aoEncerrar}>
            Encerrar
          </Button>
        </div>
        <h2 aria-live="polite" className="font-heading text-base leading-snug font-medium">
          {passo.titulo}
        </h2>
        <p className="text-muted-foreground">{passo.texto}</p>
        <div className="flex justify-end gap-2 pt-1">
          {indice > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={() => setIndice((i) => i - 1)}>
              Voltar
            </Button>
          )}
          <Button type="button" size="lg" onClick={() => (ultimo ? aoEncerrar() : setIndice((i) => i + 1))}>
            {ultimo ? "Concluir" : "Próximo"}
          </Button>
        </div>
      </div>
    </>
  );
}
