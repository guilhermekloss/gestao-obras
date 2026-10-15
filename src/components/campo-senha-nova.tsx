"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DICA_SENHA, SENHA_MINIMA, requisitosSenha } from "@/services/senha";

/**
 * Campo de senha nova com o formato exigido à vista: a lista de requisitos
 * (mesmas regras do servidor, `services/senha.ts`) se marca enquanto a pessoa
 * digita. Nome e e-mail vêm dos campos `nome`/`email` do mesmo formulário ou,
 * sem esses campos (Minha conta), das props.
 *
 * `outraPessoa`: o admin define a senha de alguém (o texto fala "da pessoa").
 */
export function CampoSenhaNova({
  id = "senha",
  name = "senha",
  required = true,
  invalido,
  outraPessoa = false,
  nome,
  email,
}: {
  id?: string;
  name?: string;
  required?: boolean;
  invalido?: boolean;
  outraPessoa?: boolean;
  nome?: string;
  email?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [senha, setSenha] = useState("");
  const [contexto, setContexto] = useState<{ nome?: string; email?: string }>({});

  // acompanha nome e e-mail digitados no mesmo formulário (regra "não contém seu e-mail/nome")
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
    // o React limpa o formulário depois da action: a lista volta ao estado vazio
    const limpar = () => setSenha("");
    ler();
    // campo não controlado: o que foi digitado antes da hidratação é preservado e lido aqui
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

  return (
    <div className="grid gap-2">
      <Input
        ref={ref}
        id={id}
        name={name}
        type="password"
        required={required}
        minLength={SENHA_MINIMA}
        maxLength={72}
        autoComplete="new-password"
        aria-invalid={invalido || undefined}
        aria-describedby={listaId}
        onChange={(e) => setSenha(e.target.value)}
      />
      <div id={listaId} className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="mb-1.5 font-medium text-foreground">A senha precisa ter:</p>
        <ul className="grid gap-1">
          {requisitos.map((r) => {
            const rotulo =
              outraPessoa && r.chave === "pessoal" ? "Não contém o e-mail nem é o nome da pessoa" : r.rotulo;
            const Icone = r.ok ? Check : senha ? X : Circle;
            return (
              <li
                key={r.chave}
                className={cn(
                  "flex items-start gap-1.5",
                  r.ok ? "text-emerald-700 dark:text-emerald-400" : senha ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <Icone className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  {rotulo}
                  <span className="sr-only">{r.ok ? " — atendido" : " — pendente"}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-muted-foreground">{DICA_SENHA}</p>
      </div>
    </div>
  );
}
