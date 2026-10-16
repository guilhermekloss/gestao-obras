"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/campo-senha";
import { AvisoDeAcesso } from "@/components/folha-de-acesso";

// Só para o e-mail sobreviver a uma tentativa errada (a página recarrega e o formulário volta vazio).
// Fica na aba, some ao fechá-la e nunca guarda a senha.
const CHAVE_EMAIL = "login:email";

export type AvisoDeLogin = "bloqueado" | "invalido" | "conta-criada" | "senha-trocada" | null;

export function LoginForm({ action, aviso }: { action: (formData: FormData) => Promise<void>; aviso: AvisoDeLogin }) {
  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const falhou = aviso === "invalido" || aviso === "bloqueado";

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE_EMAIL);
      if (falhou && salvo && emailRef.current && !emailRef.current.value) {
        emailRef.current.value = salvo;
        // com o e-mail de volta, o próximo passo é a senha
        if (aviso === "invalido") senhaRef.current?.focus();
      }
      if (!falhou) sessionStorage.removeItem(CHAVE_EMAIL);
    } catch {
      // armazenamento bloqueado: segue sem lembrar o e-mail
    }
  }, [falhou, aviso]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        try {
          sessionStorage.setItem(CHAVE_EMAIL, String(new FormData(e.currentTarget).get("email") ?? ""));
        } catch {
          // idem
        }
      }}
      className="mt-6 grid gap-5 rounded-lg border border-foreground/60 bg-card p-5 sm:p-6"
    >
      {aviso === "bloqueado" && (
        <AvisoDeAcesso tom="atencao" alerta titulo="Muitas tentativas sem sucesso.">
          Por segurança, aguarde 15 minutos e tente de novo.
        </AvisoDeAcesso>
      )}
      {aviso === "invalido" && (
        <AvisoDeAcesso tom="vencido" alerta id="erro-login" titulo="E-mail ou senha inválidos.">
          Confira os dois e tente de novo. Se esqueceu a senha, peça uma nova a quem administra o sistema.
        </AvisoDeAcesso>
      )}
      {aviso === "conta-criada" && (
        <AvisoDeAcesso tom="no-prazo" titulo="Conta criada.">
          Entre com seu e-mail e senha.
        </AvisoDeAcesso>
      )}
      {aviso === "senha-trocada" && (
        <AvisoDeAcesso tom="no-prazo" titulo="Senha alterada.">
          Entre de novo com a senha nova.
        </AvisoDeAcesso>
      )}

      <div className="grid gap-2">
        <Label htmlFor="email" className="text-base font-semibold">
          E-mail
        </Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@empresa.com"
          aria-invalid={aviso === "invalido" ? true : undefined}
          aria-describedby={aviso === "invalido" ? "erro-login" : undefined}
          className="h-12"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="senha" className="text-base font-semibold">
          Senha
        </Label>
        <CampoSenha
          ref={senhaRef}
          id="senha"
          name="senha"
          required
          maxLength={1024}
          autoComplete="current-password"
          aria-invalid={aviso === "invalido" ? true : undefined}
          aria-describedby={aviso === "invalido" ? "erro-login" : undefined}
          className="h-12"
        />
      </div>

      <BotaoEntrar />
    </form>
  );
}

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full text-base">
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}
