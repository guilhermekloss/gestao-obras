"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { marcarAssistenteVisto } from "@/app/(app)/assistente/actions";
import { tourDaTela, tourDeBoasVindas, type Tour as TourTipo } from "@/services/assistente";
import { BOAS_VINDAS, primeiroNome } from "./boas-vindas";
import { Central } from "./central";
import { posicaoDoBotao } from "./posicao";
import { Tour } from "./tour";

export type AssistenteProps = {
  role: Role;
  nome: string;
  /** A pessoa ainda não passou pelo assistente: abre o pop-up de boas-vindas. */
  pendente: boolean;
  /** Há chave do Gemini no servidor: libera a aba de perguntas. */
  iaDisponivel: boolean;
};

export function Assistente({ role, nome, pendente, iaDisponivel }: AssistenteProps) {
  const pathname = usePathname() ?? "";
  const [boasVindas, setBoasVindas] = useState(pendente);
  const [central, setCentral] = useState(false);
  const [tour, setTour] = useState<TourTipo | null>(null);
  const botao = useRef<HTMLButtonElement>(null);

  // qualquer saída do pop-up conta como visto; falha da rede não pode travar a tela
  const dispensar = useCallback(() => {
    setBoasVindas(false);
    marcarAssistenteVisto().catch(() => {});
  }, []);

  // o tour abre depois que o diálogo anterior fecha, para o foco de retorno ser o botão
  const iniciarTour = useCallback((t: TourTipo | null) => {
    if (!t) return;
    setTimeout(() => setTour(t), 0);
  }, []);

  const posicao = posicaoDoBotao(pathname);

  return (
    <>
      <button
        ref={botao}
        type="button"
        data-assistente="botao"
        aria-label="Abrir assistente de navegação"
        aria-haspopup="dialog"
        onClick={() => setCentral(true)}
        className="fixed right-4 bottom-(--assistente-bottom-celular) z-40 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border bg-card px-3 text-sm font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4 md:bottom-(--assistente-bottom-desktop)"
        style={
          {
            "--assistente-bottom-celular": posicao.celular,
            "--assistente-bottom-desktop": posicao.desktop,
          } as React.CSSProperties
        }
      >
        <Compass aria-hidden className="size-5 text-primary" />
        <span className="hidden sm:inline">Assistente</span>
      </button>

      <Dialog
        open={boasVindas}
        onOpenChange={(aberto) => {
          if (!aberto) dispensar();
        }}
      >
        <DialogContent showCloseButton={false} data-assistente="boas-vindas" className="gap-4 sm:max-w-lg">
          <div className="grid gap-2">
            <DialogTitle className="text-lg leading-snug">Boas-vindas, {primeiroNome(nome)}</DialogTitle>
            <DialogDescription>Veja o que você faz por aqui.</DialogDescription>
          </div>
          <ul className="grid list-disc gap-2 pl-5 text-sm">
            {BOAS_VINDAS[role].map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
          <DialogFooter className="-mx-4 flex-col-reverse sm:flex-row sm:flex-wrap">
            <Button type="button" variant="ghost" size="lg" onClick={dispensar}>
              Agora não
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                dispensar();
                setCentral(true);
              }}
            >
              Ver os guias
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                dispensar();
                const t = tourDeBoasVindas(role);
                if (t) iniciarTour(t);
                else setCentral(true);
              }}
            >
              Fazer o tour (2 min)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Central
        aberto={central}
        aoMudar={setCentral}
        role={role}
        pathname={pathname}
        iaDisponivel={iaDisponivel}
        aoMostrarTela={() => {
          setCentral(false);
          iniciarTour(tourDaTela(pathname, role));
        }}
        aoRefazerTour={() => {
          setCentral(false);
          iniciarTour(tourDeBoasVindas(role));
        }}
      />

      {tour && <Tour key={tour.id} tour={tour} aoEncerrar={() => setTour(null)} retorno={botao} />}
    </>
  );
}
