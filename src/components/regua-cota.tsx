import { cn } from "@/lib/utils";

/**
 * Barra de avanço desenhada como linha de cota de planta:
 * traço fino com marca nas duas pontas, preenchimento e uma marca no valor atual.
 */
export function ReguaCota({
  percent,
  cor = "bg-primary",
  rotulo,
  className,
}: {
  percent: number;
  cor?: string;
  rotulo: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("relative mx-px h-5 min-w-16 flex-1", className)}
    >
      <span className="absolute inset-y-0.5 left-0 w-px bg-foreground/70" />
      <span className="absolute inset-y-0.5 right-0 w-px bg-foreground/70" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span
        className={cn("absolute top-1/2 left-0 h-1.5 -translate-y-1/2", cor)}
        style={{ width: `${pct}%` }}
      />
      <span
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
