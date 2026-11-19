import Link from "next/link";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AvisosCredito, ModoCusto } from "@/services/tributacao/custo-liquido";

/**
 * Bruto, crédito de IBS/CBS a recuperar e custo líquido lado a lado. O que está em destaque é o número principal
 * da tela (o líquido, ou o bruto quando o usuário pediu para ver o bruto).
 */
export function ResumoCreditoIbsCbs({
  brutoCents,
  creditoCents,
  liquidoCents,
  modo,
  hrefAlternar,
  className,
}: {
  brutoCents: number;
  creditoCents: number;
  liquidoCents: number;
  modo: ModoCusto;
  /** Endereço que troca entre bruto e líquido; sem ele, não há alternância. */
  hrefAlternar?: string;
  className?: string;
}) {
  return (
    <section aria-label="Crédito de IBS/CBS" className={cn("flex flex-wrap items-end gap-x-8 gap-y-2 text-sm", className)}>
      <Valor titulo="Realizado bruto" cents={brutoCents} destaque={modo === "BRUTO"} />
      <Valor titulo="Crédito IBS/CBS a recuperar" cents={creditoCents} sinal="-" />
      <Valor titulo="Custo líquido" cents={liquidoCents} destaque={modo === "LIQUIDO"} />
      {hrefAlternar && (
        <Link href={hrefAlternar} className="min-h-10 content-center text-primary underline-offset-4 hover:underline">
          {modo === "LIQUIDO" ? "Ver o bruto" : "Ver o líquido"}
        </Link>
      )}
    </section>
  );
}

function Valor({ titulo, cents, sinal, destaque = false }: { titulo: string; cents: number; sinal?: "-"; destaque?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("num", destaque ? "text-xl font-semibold" : "text-base")}>
        {sinal && cents > 0 ? "− " : ""}
        {formatarMoeda(cents)}
      </p>
    </div>
  );
}

/** Avisos curtos sobre o IBS/CBS que não virou crédito; o do regime só para quem pode corrigir (ADMIN). */
export function AvisosCreditoIbsCbs({
  avisos,
  podeInformarRegime,
  className,
}: {
  avisos: AvisosCredito;
  podeInformarRegime: boolean;
  className?: string;
}) {
  const linhas: React.ReactNode[] = [];
  if (avisos.pedirRegime && podeInformarRegime) {
    linhas.push(
      <>
        Há IBS/CBS destacado nas notas, mas o regime da empresa não foi informado, então nada vira crédito.{" "}
        <Link href="/empresa#secao-ibs-cbs" className="text-primary underline-offset-4 hover:underline">
          Informar o regime
        </Link>
      </>,
    );
  }
  if (avisos.periodoTesteCents > 0) {
    linhas.push(`O IBS/CBS destacado em 2026 (${formatarMoeda(avisos.periodoTesteCents)}) é de teste e não gera crédito.`);
  }
  if (avisos.naoCreditadoCents > 0) {
    linhas.push(`${formatarMoeda(avisos.naoCreditadoCents)} de IBS/CBS não virou crédito: classificação que veda o crédito ou ainda não conferida.`);
  }
  if (linhas.length === 0) return null;
  return (
    <ul className={cn("space-y-0.5 text-sm text-muted-foreground", className)}>
      {linhas.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}
