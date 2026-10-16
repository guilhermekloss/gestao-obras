"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, X } from "lucide-react";
import { CampoSenha } from "@/components/campo-senha";
import { ReguaCota } from "@/components/regua-cota";
import { cn } from "@/lib/utils";
import { DICA_SENHA, SENHA_MINIMA, requisitosSenha } from "@/services/senha";

export function CampoSenhaNova({
  id = "senha",
  name = "senha",
  required = true,
  invalido,
  outraPessoa = false,
  nome,
  email,
  className,
}: {
  id?: string;
  name?: string;
  required?: boolean;
  invalido?: boolean;
  outraPessoa?: boolean;
  nome?: string;
  email?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [senha, setSenha] = useState("");
  const [contexto, setContexto] = useState<{ nome?: string; email?: string }>({});

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const ler = () => {
      const valor = (campo: string) => {
        const el = form.elements.namedItem(campo);
        return el instanceof HTMLInputElement ? el.value : undefined;
      };
      setContexto({ nome: valor("nome") ?? nome, email: valor("email") ?? email });
    };
    // o React limpa o formulário depois da action
    const limpar = () => setSenha("");
    ler();
    // não controlado: preserva o que foi digitado antes da hidratação
    setSenha(ref.current?.value ?? "");
    form.addEventListener("input", ler);
    form.addEventListener("reset", limpar);
    return () => {
      form.removeEventListener("input", ler);
      form.removeEventListener("reset", limpar);
    };
  }, [nome, email]);

  const requisitos = requisitosSenha(senha, contexto);
  const listaId = `${id}-requisitos`;
  const atendidos = requisitos.filter((r) => r.ok).length;
  const completa = atendidos === requisitos.length;

  return (
    <div className="grid gap-3">
      <CampoSenha
        ref={ref}
        id={id}
        name={name}
        required={required}
        minLength={SENHA_MINIMA}
        maxLength={72}
        autoComplete="new-password"
        aria-invalid={invalido || undefined}
        aria-describedby={listaId}
        onChange={(e) => setSenha(e.target.value)}
        className={className}
      />
      <div id={listaId} className="text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium text-foreground">A senha precisa ter:</p>
          <p className={cn("num text-base", completa ? "text-estado-no-prazo-fg" : "text-muted-foreground")}>
            {atendidos} de {requisitos.length}
          </p>
        </div>
        <ReguaCota
          percent={(atendidos / requisitos.length) * 100}
          rotulo="Requisitos da senha atendidos"
          cor={completa ? "bg-estado-no-prazo-borda" : "bg-primary"}
          className="my-1.5 w-full flex-none"
        />
        <ul className="grid gap-1.5">
          {requisitos.map((r) => {
            const rotulo =
              outraPessoa && r.chave === "pessoal" ? "Não contém o e-mail nem é o nome da pessoa" : r.rotulo;
            const Icone = r.ok ? Check : senha ? X : Circle;
            return (
              <li
                key={r.chave}
                className={cn(
                  "flex items-start gap-2",
                  r.ok ? "text-estado-no-prazo-fg" : senha ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {rotulo}
                  <span className="sr-only">{r.ok ? " — atendido" : " — pendente"}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-muted-foreground">{DICA_SENHA}</p>
      </div>
    </div>
  );
}
