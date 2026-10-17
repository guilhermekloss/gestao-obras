"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/acao";

export function ConfirmButton({
  action,
  mensagem,
  rotulo,
  children,
  variant = "destructive",
  size = "sm",
}: {
  action: () => Promise<ActionResult>;
  mensagem: string;
  /** Nome do botão para leitor de tela. Obrigatório quando o botão só tem ícone. */
  rotulo?: string;
  children: React.ReactNode;
  variant?: "destructive" | "outline" | "ghost";
  size?: "sm" | "icon" | "default" | "lg";
}) {
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pendente}
      aria-label={rotulo}
      onClick={() => {
        if (!confirm(mensagem)) return;
        startTransition(async () => {
          const res = await action();
          if (!res?.ok && res?.erro) toast.error(res.erro);
        });
      }}
    >
      {children}
    </Button>
  );
}
