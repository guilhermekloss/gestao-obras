"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DICA_SENHA, SENHA_MINIMA } from "@/services/senha";
import { alterarMinhaSenha, type EstadoSenha } from "./actions";

export function SenhaForm() {
  const [estado, enviar, pendente] = useActionState<EstadoSenha, FormData>(alterarMinhaSenha, {});
  const invalido = (campo: EstadoSenha["campo"]) => estado.campo === campo || undefined;

  return (
    <form action={enviar} className="grid max-w-sm gap-4">
      <div className="grid gap-2">
        <Label htmlFor="atual">Senha atual</Label>
        <Input id="atual" name="atual" type="password" required maxLength={1024} autoComplete="current-password" aria-invalid={invalido("atual")} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="nova">Senha nova</Label>
        <Input
          id="nova"
          name="nova"
          type="password"
          required
          minLength={SENHA_MINIMA}
          maxLength={72}
          autoComplete="new-password"
          aria-invalid={invalido("nova")}
        />
        <p className="text-xs text-muted-foreground">{DICA_SENHA}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmacao">Repita a senha nova</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          required
          maxLength={72}
          autoComplete="new-password"
          aria-invalid={invalido("confirmacao")}
        />
      </div>
      {estado.erro && (
        <p className="text-sm text-destructive" role="alert">
          {estado.erro}
        </p>
      )}
      <Button type="submit" disabled={pendente} className="w-fit">
        {pendente ? "Salvando..." : "Trocar senha"}
      </Button>
      <p className="text-xs text-muted-foreground">Depois da troca, você entra de novo com a senha nova em todos os aparelhos.</p>
    </form>
  );
}
