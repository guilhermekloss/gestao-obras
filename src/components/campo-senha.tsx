"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de senha com "Mostrar/Ocultar". O botão tem 44 px de alvo e fica dentro do campo.
 * Começa sempre oculto; o nome do botão acompanha o texto visível.
 */
export function CampoSenha({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visivel, setVisivel] = useState(false);
  const Icone = visivel ? EyeOff : Eye;
  const idCampo = useId();

  return (
    <div className="relative">
      <Input
        id={props.id ?? idCampo}
        {...props}
        type={visivel ? "text" : "password"}
        className={cn("pr-28", className)}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-controls={props.id ?? idCampo}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex min-w-11 items-center gap-1.5 rounded-r-lg px-3 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Icone aria-hidden className="size-4 shrink-0" />
        <span aria-hidden>{visivel ? "Ocultar" : "Mostrar"}</span>
      </button>
    </div>
  );
}
