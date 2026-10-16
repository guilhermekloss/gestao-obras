import Link from "next/link";
import { CircleDashed, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lista ou quadro sem nada ainda. A moldura tracejada é a "área reservada" da prancheta:
 * o tracejado diz que falta preencher (o contorno cheio fica para estado real, como em AvisoDePagina).
 *
 * `acao` só deve ser passada quando o papel do usuário pode executá-la; sem ela a explicação
 * precisa dizer a quem pedir. Use `AcaoVazio` para link e passe um botão pronto (ex.: diálogo) nos demais casos.
 */
export function EstadoVazio({
  icone: Icone = CircleDashed,
  titulo,
  children,
  acao,
  compacto = false,
  nivel = 2,
  className,
}: {
  icone?: LucideIcon;
  titulo: string;
  /** Uma linha: o que falta e por que vale preencher. */
  children: React.ReactNode;
  acao?: React.ReactNode;
  /** Dentro de cartão ou tabela: centralizado e sem a linha de cota. */
  compacto?: boolean;
  nivel?: 2 | 3;
  className?: string;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <section
      className={cn(
        compacto
          ? "flex flex-col items-center px-2 py-8 text-center"
          : "relative max-w-xl border-t border-foreground/60 pt-6",
        className,
      )}
    >
      {!compacto && (
        <>
          <span aria-hidden className="absolute -top-1.5 left-0 h-3 w-px bg-foreground/60" />
          <span aria-hidden className="absolute -top-1.5 right-0 h-3 w-px bg-foreground/60" />
        </>
      )}
      <span className="grid size-11 place-items-center rounded-md border-2 border-dashed border-estado-neutro-borda bg-estado-neutro text-estado-neutro-fg">
        <Icone aria-hidden className="size-5" />
      </span>
      <Titulo className="mt-3 text-lg font-semibold md:text-xl">{titulo}</Titulo>
      <p className={cn("mt-1 text-pretty text-muted-foreground", compacto && "max-w-sm text-sm")}>{children}</p>
      {acao && <div className={cn("mt-5 flex flex-wrap gap-2", compacto && "justify-center")}>{acao}</div>}
    </section>
  );
}

/** Ação em forma de link, com alvo de toque de 44px (size lg). */
export function AcaoVazio({
  href,
  icone: Icone,
  variante = "default",
  children,
}: {
  href: string;
  icone?: LucideIcon;
  variante?: "default" | "outline";
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonVariants({ variant: variante, size: "lg" })}>
      {Icone && <Icone aria-hidden className="size-4" />}
      {children}
    </Link>
  );
}
