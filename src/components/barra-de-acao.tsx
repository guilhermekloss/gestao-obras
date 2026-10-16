import { cn } from "@/lib/utils";

/**
 * Barra com a ação principal da tela, ao alcance do polegar. No celular fica fixa logo acima da
 * barra inferior (`BottomNav` publica a altura dela em `--altura-bottom-nav`); no desktop, cola na base da janela.
 * A tela que usa precisa de folga embaixo (`pb-*`) para o último campo não ficar escondido.
 */
export function BarraDeAcao({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[var(--altura-bottom-nav,5rem)] z-30 border-t bg-card px-4 py-3 md:sticky md:inset-x-auto md:bottom-0 md:rounded-xl md:border md:px-4",
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 md:max-w-none">{children}</div>
    </div>
  );
}
