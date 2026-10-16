"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/campo-senha";
import { CampoSenhaNova } from "@/components/campo-senha-nova";
import { AvisoDeAcesso } from "@/components/folha-de-acesso";
import { aceitarConvite, type EstadoCadastro } from "./actions";

export function CadastroForm({ token, nome, email }: { token: string; nome: string; email: string | null }) {
  const [estado, enviar, pendente] = useActionState<EstadoCadastro, FormData>(
    aceitarConvite.bind(null, token),
    {},
  );
  const invalido = (campo: string) => (estado.campo === campo ? true : undefined);
  const descrito = (campo: string) => (estado.erro && estado.campo === campo ? "erro-cadastro" : undefined);

  return (
    <form action={enviar} className="grid gap-5 rounded-lg border border-foreground/60 bg-card p-5 sm:p-6">
      <div className="grid gap-2">
        <Label htmlFor="nome" className="text-base font-semibold">
          Seu nome
        </Label>
        <Input
          id="nome"
          name="nome"
          required
          autoFocus
          defaultValue={estado.nome ?? nome}
          autoComplete="name"
          aria-invalid={invalido("nome")}
          aria-describedby={descrito("nome")}
          className="h-12"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email" className="text-base font-semibold">
          E-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={email ?? estado.email ?? ""}
          readOnly={!!email}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalido("email")}
          aria-describedby={descrito("email")}
          className="h-12 read-only:bg-muted/60"
        />
        {email && <p className="text-sm text-muted-foreground">Este convite é para este e-mail.</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="senha" className="text-base font-semibold">
          Crie uma senha
        </Label>
        <CampoSenhaNova invalido={invalido("senha")} className="h-12" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmacao" className="text-base font-semibold">
          Repita a senha
        </Label>
        <CampoSenha
          id="confirmacao"
          name="confirmacao"
          required
          maxLength={72}
          autoComplete="new-password"
          aria-invalid={invalido("confirmacao")}
          aria-describedby={descrito("confirmacao")}
          className="h-12"
        />
      </div>
      {estado.erro && (
        <AvisoDeAcesso tom="vencido" alerta id="erro-cadastro" titulo={estado.erro} />
      )}
      <Button type="submit" size="lg" disabled={pendente} className="h-12 w-full text-base">
        {pendente ? "Criando sua conta..." : "Criar conta e entrar"}
      </Button>
    </form>
  );
}
