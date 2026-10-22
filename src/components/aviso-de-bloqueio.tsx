"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ShieldAlert } from "lucide-react";
import { ESTADO } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Faixa no topo do app: a conta foi bloqueada por senha errada vinda de outro aparelho desde a última vez que a pessoa viu. */
export function AvisoDeBloqueio({ quando, marcarVisto }: { quando: string; marcarVisto: () => Promise<void> }) {
  const [pendente, startTransition] = useTransition();
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm md:px-6", ESTADO.atencao.classe)}>
      <ShieldAlert aria-hidden className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>Sua conta foi bloqueada por senha errada em {quando}.</strong> Se não foi você tentando entrar, troque a senha
        agora.
      </p>
      <div className="flex gap-2">
        <Button size="sm" render={<Link href="/conta" />}>
          Trocar senha
        </Button>
        <Button size="sm" variant="outline" disabled={pendente} onClick={() => startTransition(() => marcarVisto())}>
          Fui eu
        </Button>
      </div>
    </div>
  );
}
