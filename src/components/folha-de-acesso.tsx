import type { ReactNode } from "react";
import { ESTADO, type Estado } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * Casca das telas públicas (entrar, convite): a tela é uma folha de prancheta.
 * Moldura em linha dupla, malha de papel, a planta de um lote ao fundo (só em tela larga)
 * e uma legenda no canto, como no selo de um projeto.
 */
export function FolhaDeAcesso({ children, desenho = true }: { children: ReactNode; desenho?: boolean }) {
  return (
    <main className="papel-quadriculado min-h-svh p-3 sm:p-5">
      <div className="relative mx-auto flex min-h-[calc(100svh-1.5rem)] max-w-6xl flex-col border border-foreground/60 bg-background/70 p-4 sm:min-h-[calc(100svh-2.5rem)] sm:p-8 lg:p-10">
        {/* segunda linha da moldura */}
        <span aria-hidden className="pointer-events-none absolute inset-1 border border-border" />

        <Marca />

        <div className="relative z-10 grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-14">
          <div className="min-w-0">{children}</div>
          {desenho && <PlantaDoLote className="hidden lg:block" />}
        </div>

        <Legenda />
      </div>
    </main>
  );
}

function Marca() {
  return (
    <div className="relative z-10 flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-sm bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 4v16h16" />
          <rect x="9" y="9" width="7" height="7" />
        </svg>
      </span>
      <span className="font-heading text-lg font-semibold">Gestão de Obras</span>
    </div>
  );
}

/** Rodapé da folha. Em tela larga é o selo do projeto; no celular, uma linha. */
function Legenda() {
  const celulas = [
    ["Notas e contas", "Lance e pague no prazo"],
    ["Diário de obra", "RDO pelo celular"],
    ["Cronograma", "Etapas, Gantt e curva S"],
  ];
  return (
    <>
      <p className="relative z-10 text-sm text-muted-foreground lg:hidden">
        Só entra quem tem cadastro ou convite.
      </p>
      <dl className="relative z-10 ml-auto hidden w-full max-w-xl grid-cols-3 overflow-hidden rounded-lg border border-foreground/60 bg-card lg:grid">
        {celulas.map(([titulo, detalhe]) => (
          <div key={titulo} className="border-l border-foreground/60 px-4 py-3 first:border-l-0">
            <dt className="text-sm font-semibold">{titulo}</dt>
            <dd className="text-sm text-muted-foreground">{detalhe}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** Título sobre uma linha de cota: marca nas pontas e o texto no meio, como numa dimensão de planta. */
export function TituloCota({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <span aria-hidden className="h-4 w-px shrink-0 bg-foreground/70" />
      <span aria-hidden className="h-px w-5 shrink-0 bg-foreground/70" />
      <h1 className="px-3 text-2xl md:text-3xl">{children}</h1>
      <span aria-hidden className="h-px flex-1 bg-foreground/70" />
      <span aria-hidden className="h-4 w-px shrink-0 bg-foreground/70" />
    </div>
  );
}

/** Aviso dentro do formulário: estado = fundo + borda + ícone + palavra (nunca só cor). */
export function AvisoDeAcesso({
  tom,
  titulo,
  children,
  alerta = false,
  id,
}: {
  tom: Extract<Estado, "no-prazo" | "atencao" | "vencido" | "neutro">;
  titulo: string;
  children?: ReactNode;
  alerta?: boolean;
  id?: string;
}) {
  const { Icone, classe } = ESTADO[tom];
  return (
    <div
      id={id}
      role={alerta ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", classe, "font-normal")}
    >
      <Icone aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="grid gap-0.5">
        <p className="font-semibold">{titulo}</p>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

/**
 * Planta baixa de um lote com casa, portas e cotas. Só enfeite (aria-hidden); desenha-se uma vez ao abrir.
 * Cores só de tokens: o tema escuro troca o azul sozinho.
 */
function PlantaDoLote({ className }: { className?: string }) {
  const traco = "traco-desenhado fill-none stroke-primary";
  return (
    <svg viewBox="0 0 600 460" aria-hidden className={cn("h-auto w-full max-w-xl justify-self-center", className)}>
      {/* divisa do lote */}
      <rect x="70" y="70" width="480" height="340" className="fill-none stroke-primary/50" strokeWidth="1.5" strokeDasharray="10 6" />

      {/* paredes externas */}
      <rect x="150" y="130" width="274" height="206" pathLength={1} className={traco} strokeWidth="4" />
      {/* paredes internas */}
      <path d="M290 130V336M150 250H290" pathLength={1} className={cn(traco, "traco-desenhado-tardio")} strokeWidth="2.5" />

      {/* janela na parede de cima */}
      <rect x="320" y="126" width="64" height="8" className="fill-background stroke-none" />
      <path d="M320 128H384M320 132H384" className="fill-none stroke-primary" strokeWidth="1" />
      {/* porta entre os cômodos */}
      <rect x="286" y="165" width="8" height="30" className="fill-background stroke-none" />
      <path d="M290 195H260M260 195A30 30 0 0 1 290 165" className="fill-none stroke-primary" strokeWidth="1.5" />
      {/* porta de entrada */}
      <rect x="330" y="332" width="32" height="8" className="fill-background stroke-none" />
      <path d="M362 336V304M362 304A32 32 0 0 0 330 336" className="fill-none stroke-primary" strokeWidth="1.5" />

      {/* cota de cima: largura do lote */}
      <g className="fill-none stroke-primary" strokeWidth="1.5">
        <path d="M70 44H550M70 34V54M550 34V54M64 50L76 38M544 50L556 38" pathLength={1} className="traco-desenhado traco-desenhado-tardio" />
      </g>
      <text x="310" y="36" textAnchor="middle" className="num fill-primary text-[15px]">
        14,00
      </text>

      {/* cota da direita: fundo do lote */}
      <g className="fill-none stroke-primary" strokeWidth="1.5">
        <path d="M580 70V410M570 70H590M570 410H590M574 76L586 64M574 416L586 404" pathLength={1} className="traco-desenhado traco-desenhado-tardio" />
      </g>
      <text transform="translate(570 240) rotate(-90)" textAnchor="middle" className="num fill-primary text-[15px]">
        10,00
      </text>

      {/* cota da casa */}
      <g className="fill-none stroke-primary/70" strokeWidth="1">
        <path d="M150 372H424M150 362V382M424 362V382M144 378L156 366M418 378L430 366" />
      </g>
      <text x="287" y="364" textAnchor="middle" className="num fill-primary/80 text-[13px]">
        8,00
      </text>
    </svg>
  );
}
