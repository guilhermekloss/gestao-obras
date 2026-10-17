"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { Compass, Search, X } from "lucide-react";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  buscarGuias,
  guiaDaRota,
  tourDaTela,
  tourDeBoasVindas,
  type Guia,
} from "@/services/assistente";
import { Chat, useChat } from "./chat";

type Aba = "guias" | "perguntas";

export function Central({
  aberto,
  aoMudar,
  role,
  pathname,
  iaDisponivel,
  aoMostrarTela,
  aoRefazerTour,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  role: Role;
  pathname: string;
  iaDisponivel: boolean;
  aoMostrarTela: () => void;
  aoRefazerTour: () => void;
}) {
  const [aba, setAba] = useState<Aba>("guias");
  const [busca, setBusca] = useState("");
  const chat = useChat(pathname);
  const fechar = () => aoMudar(false);

  const daTela = useMemo(() => guiaDaRota(pathname, role), [pathname, role]);
  const temTourDaTela = useMemo(() => tourDaTela(pathname, role) !== null, [pathname, role]);
  const temBoasVindas = useMemo(() => tourDeBoasVindas(role) !== null, [role]);
  const guias = useMemo(() => buscarGuias(busca, role), [busca, role]);

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent
        showCloseButton={false}
        data-assistente="central"
        className={cn(
          // celular: folha que sobe da base, como o "Mais" do menu
          "top-auto bottom-0 left-0 flex max-h-[88svh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-xl p-0 data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom",
          // desktop: folha lateral à direita
          "sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto sm:h-svh sm:max-h-none sm:w-[26rem] sm:max-w-[26rem] sm:rounded-none sm:border-l sm:data-open:slide-in-from-right sm:data-open:slide-in-from-bottom-0 sm:data-closed:slide-out-to-right sm:data-closed:slide-out-to-bottom-0",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div className="grid gap-1">
            <DialogTitle className="text-lg">Central de ajuda</DialogTitle>
            <DialogDescription>Guias e passo a passo de cada tela.</DialogDescription>
          </div>
          <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
            <X aria-hidden className="size-4" />
            Fechar
          </DialogClose>
        </div>

        {iaDisponivel && (
          <div role="tablist" aria-label="Ajuda" className="grid shrink-0 grid-cols-2 border-b">
            {(
              [
                ["guias", "Guias"],
                ["perguntas", "Pergunte ao assistente"],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`assistente-aba-${id}`}
                aria-selected={aba === id}
                aria-controls={`assistente-painel-${id}`}
                onClick={() => setAba(id)}
                className={cn(
                  "min-h-12 border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  aba === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        <div
          role={iaDisponivel ? "tabpanel" : undefined}
          id={`assistente-painel-${aba}`}
          aria-labelledby={iaDisponivel ? `assistente-aba-${aba}` : undefined}
          className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          {aba === "perguntas" && iaDisponivel ? (
            <Chat chat={chat} aoNavegar={fechar} />
          ) : (
            <>
              <section aria-labelledby="assistente-nesta-tela" className="grid gap-2 rounded-xl border bg-card p-4">
                <h3 id="assistente-nesta-tela" className="text-sm font-semibold text-muted-foreground">
                  Nesta tela
                </h3>
                {daTela ? (
                  <>
                    <p className="font-medium">{daTela.titulo}</p>
                    <p className="text-sm text-muted-foreground">{daTela.paraQueServe}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Esta tela não tem um guia próprio. Use a busca abaixo para achar a ajuda que precisa.
                  </p>
                )}
                {temTourDaTela && (
                  <Button type="button" size="lg" className="justify-self-start" onClick={aoMostrarTela}>
                    <Compass aria-hidden className="size-4" />
                    Mostrar nesta tela
                  </Button>
                )}
              </section>

              <div className="grid gap-2">
                <Label htmlFor="assistente-busca">Buscar ajuda</Label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="assistente-busca"
                    type="search"
                    value={busca}
                    autoComplete="off"
                    onChange={(e) => setBusca(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
              </div>

              {guias.length === 0 ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Nenhum guia encontrado para &ldquo;{busca.trim()}&rdquo;. Tente outra palavra.
                </p>
              ) : (
                <Accordion aria-label="Guias do sistema">
                  {guias.map((g) => (
                    <AccordionItem key={g.id} value={g.id}>
                      <AccordionTrigger className="min-h-14">
                        <span className="font-medium">{g.titulo}</span>
                      </AccordionTrigger>
                      <AccordionPanel>
                        <GuiaCorpo guia={g} aoIr={fechar} />
                      </AccordionPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}

              {temBoasVindas && (
                <Button type="button" variant="outline" size="lg" className="justify-self-start" onClick={aoRefazerTour}>
                  Refazer o tour de boas-vindas
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <h4 className="text-sm font-semibold">{titulo}</h4>
      {children}
    </div>
  );
}

function GuiaCorpo({ guia, aoIr }: { guia: Guia; aoIr: () => void }) {
  return (
    <div className="grid gap-4 text-sm">
      <Secao titulo="Para que serve">
        <p className="text-muted-foreground">{guia.paraQueServe}</p>
      </Secao>
      {guia.passoAPasso.length > 0 && (
        <Secao titulo="Passo a passo">
          <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
            {guia.passoAPasso.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </Secao>
      )}
      {guia.regras.length > 0 && (
        <Secao titulo="Regras do sistema">
          <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
            {guia.regras.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Secao>
      )}
      {guia.dicas && guia.dicas.length > 0 && (
        <Secao titulo="Dicas">
          <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
            {guia.dicas.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Secao>
      )}
      <Link
        href={guia.link}
        onClick={aoIr}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "justify-self-start")}
      >
        Ir para a tela
      </Link>
    </div>
  );
}
