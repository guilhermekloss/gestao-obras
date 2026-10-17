"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { Ellipsis, DraftingCompass } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dividirBarra, itensPara, naRota, TITULOS } from "@/components/nav-itens";

const ATIVO = "bg-nav-ativo font-semibold text-primary";

export function Sidebar({
  role,
  usuario,
}: {
  role: Role;
  usuario: { nome: string; papel: string };
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Menu principal"
      className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:sticky md:top-0 md:flex md:h-svh"
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
          <DraftingCompass aria-hidden className="size-4.5" />
        </span>
        <span className="text-lg font-semibold [font-stretch:112%]">Gestão de Obras</span>
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {itensPara(role).map((item) => {
          const ativo = naRota(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                data-assistente={`menu:${item.href}`}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md border-l-4 px-3 py-2 text-sm transition-colors",
                  ativo
                    ? cn("border-primary", ATIVO)
                    : "border-transparent font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <item.icon aria-hidden className="size-4.5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 border-t p-4">
        <p className="truncate text-sm font-semibold">{usuario.nome}</p>
        <p className="text-sm text-muted-foreground">{usuario.papel}</p>
      </div>
    </nav>
  );
}

const TAB =
  "flex min-h-16 flex-col items-center justify-start gap-0.5 px-0.5 pt-2 pb-1.5 text-center text-xs leading-tight text-balance [font-stretch:88%] transition-colors";

function Marca({ ativo, children }: { ativo: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "grid h-7 w-12 place-items-center rounded-md transition-colors",
        ativo ? "bg-nav-ativo" : "",
      )}
    >
      {children}
    </span>
  );
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const { barra, mais } = dividirBarra(itensPara(role));
  const maisAtivo = mais.some((i) => naRota(pathname, i.href));
  const colunas = barra.length + (mais.length > 0 ? 1 : 0);
  const navRef = useRef<HTMLElement>(null);

  // telas com barra de ação fixa (ex.: salvar o RDO) se apoiam nesta altura; ela muda com rótulo em 2 linhas e área segura
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const raiz = document.documentElement;
    const publicar = () => raiz.style.setProperty("--altura-bottom-nav", `${nav.offsetHeight}px`);
    publicar();
    const observador = new ResizeObserver(publicar);
    observador.observe(nav);
    return () => {
      observador.disconnect();
      raiz.style.removeProperty("--altura-bottom-nav");
    };
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Menu principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
        {barra.map((item) => {
          const ativo = naRota(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                data-assistente={`menu:${item.href}`}
                aria-current={ativo ? "page" : undefined}
                className={cn(TAB, ativo ? "font-semibold text-primary" : "text-muted-foreground")}
              >
                <Marca ativo={ativo}>
                  <item.icon aria-hidden className="size-5" />
                </Marca>
                {item.label}
              </Link>
            </li>
          );
        })}
        {mais.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setAberto(true)}
              aria-haspopup="dialog"
              data-assistente="menu:mais"
              aria-expanded={aberto}
              className={cn(
                TAB,
                "w-full",
                maisAtivo ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              <Marca ativo={maisAtivo}>
                <Ellipsis aria-hidden className="size-5" />
              </Marca>
              Mais
            </button>
          </li>
        )}
      </ul>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent
          className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-3 rounded-b-none rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))] data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom sm:max-w-none"
        >
          <DialogTitle className="text-base">Mais telas</DialogTitle>
          <ul className="grid grid-cols-2 gap-2">
            {mais.map((item) => {
              const ativo = naRota(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setAberto(false)}
                    data-assistente={`menu:${item.href}`}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-sm",
                      ativo ? cn("border-primary", ATIVO) : "bg-card font-medium hover:bg-accent/60",
                    )}
                  >
                    <item.icon aria-hidden className="size-4.5 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </nav>
  );
}

/** Nome da seção atual no cabeçalho: fica à vista quando o título da página sai da tela. */
export function TituloDaPagina() {
  const pathname = usePathname();
  const atual = TITULOS.find((i) => naRota(pathname, i.href));
  const Icone = atual?.icon ?? DraftingCompass;
  return (
    <p className="flex min-w-0 items-center gap-2 text-lg font-semibold [font-stretch:112%]">
      <Icone aria-hidden className="size-5 shrink-0 text-primary" />
      <span className="truncate">{atual?.label ?? "Gestão de Obras"}</span>
    </p>
  );
}
