"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { perguntarAssistente } from "@/app/(app)/assistente/actions";
import type { MensagemChat, TelaSugerida } from "@/services/assistente";

type Mensagem = MensagemChat & { telas?: TelaSugerida[] };

const TAMANHO_MAXIMO = 500;

export function useChat(rota: string) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();
  const ultima = useRef<string | null>(null);

  function enviar(texto: string) {
    const pergunta = texto.trim();
    if (!pergunta || carregando) return;
    const historico = mensagens.slice(-6).map(({ autor, texto }) => ({ autor, texto }));
    ultima.current = pergunta;
    setErro(null);
    setMensagens((m) => [...m, { autor: "pessoa", texto: pergunta }]);
    iniciar(async () => {
      try {
        const r = await perguntarAssistente(pergunta, historico, rota);
        if (r.ok && r.resposta) {
          setMensagens((m) => [...m, { autor: "assistente", texto: r.resposta!, telas: r.telas }]);
        } else {
          setErro(r.erro ?? "Não consegui responder agora. Tente de novo.");
        }
      } catch {
        setErro("Não consegui responder agora. Tente de novo.");
      }
    });
  }

  return { mensagens, erro, carregando, enviar, repetir: () => ultima.current && enviar(ultima.current) };
}

export function Chat({
  chat,
  aoNavegar,
}: {
  chat: ReturnType<typeof useChat>;
  /** Fecha a central antes de ir para a tela sugerida. */
  aoNavegar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const { mensagens, erro, carregando, enviar, repetir } = chat;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Respostas geradas por IA a partir dos guias do sistema.</p>

      <div role="log" aria-live="polite" aria-label="Conversa com o assistente" className="grid gap-3">
        {mensagens.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Escreva sua dúvida, por exemplo: &ldquo;Como registro o diário de hoje?&rdquo;
          </p>
        )}
        {mensagens.map((m, i) => (
          <div
            key={i}
            className={cn(
              "grid max-w-[92%] gap-2 rounded-xl border px-3 py-2 text-sm",
              m.autor === "pessoa" ? "justify-self-end bg-muted" : "justify-self-start bg-card",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {m.autor === "pessoa" ? "Você" : "Assistente"}
            </p>
            <p className="whitespace-pre-wrap">{m.texto}</p>
            {m.telas && m.telas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {m.telas.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    onClick={aoNavegar}
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    Ir para {t.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {carregando && (
          <p role="status" className="text-sm text-muted-foreground">
            O assistente está escrevendo a resposta...
          </p>
        )}
        {erro && (
          <div
            role="alert"
            className="grid gap-2 rounded-xl border border-estado-vencido-borda bg-estado-vencido p-3 text-sm text-estado-vencido-fg"
          >
            <p>{erro}</p>
            <Button type="button" variant="outline" size="lg" className="justify-self-start" onClick={repetir}>
              Tentar de novo
            </Button>
          </div>
        )}
      </div>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
          setTexto("");
        }}
      >
        <Label htmlFor="assistente-pergunta">Pergunte sobre como usar o sistema</Label>
        <div className="flex gap-2">
          <Input
            id="assistente-pergunta"
            value={texto}
            maxLength={TAMANHO_MAXIMO}
            autoComplete="off"
            onChange={(e) => setTexto(e.target.value)}
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" size="lg" disabled={carregando || texto.trim() === ""}>
            <Send aria-hidden className="size-4" />
            Enviar pergunta
          </Button>
        </div>
      </form>
    </div>
  );
}
