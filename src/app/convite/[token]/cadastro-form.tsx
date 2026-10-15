"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenhaNova } from "@/components/campo-senha-nova";
import { aceitarConvite, type EstadoCadastro } from "./actions";

export function CadastroForm({ token, nome, email }: { token: string; nome: string; email: string | null }) {
  const [estado, enviar, pendente] = useActionState<EstadoCadastro, FormData>(
    aceitarConvite.bind(null, token),
    {},
  );
  const invalido = (campo: string) => (estado.campo === campo ? true : undefined);

  return (
    <form action={enviar} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="nome">Seu nome</Label>
        <Input id="nome" name="nome" required defaultValue={estado.nome ?? nome} autoComplete="name" aria-invalid={invalido("nome")} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={email ?? estado.email ?? ""}
          readOnly={!!email}
          autoComplete="email"
          aria-invalid={invalido("email")}
        />
        {email && <p className="text-xs text-muted-foreground">Este convite é para este e-mail.</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="senha">Crie uma senha</Label>
        <CampoSenhaNova invalido={invalido("senha")} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmacao">Repita a senha</Label>
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
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? "Criando sua conta..." : "Criar conta e entrar"}
      </Button>
    </form>
  );
}
