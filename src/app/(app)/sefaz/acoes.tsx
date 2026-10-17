"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { consultarAgora, reenviarCienciaDocumento } from "./actions";

export function BotaoConsultarAgora({ desabilitado }: { desabilitado?: boolean }) {
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pendente || desabilitado}
      onClick={() =>
        startTransition(async () => {
          const r = await consultarAgora();
          if (r.ok && r.falhou) toast.error("A consulta à Sefaz falhou", { description: r.mensagem, duration: 15_000 });
          else if (r.ok && r.nadaConsultado) toast.info("Nada a consultar agora", { description: r.mensagem, duration: 10_000 });
          else if (r.ok) toast.success("Consulta concluída", { description: r.mensagem, duration: 10_000 });
          else toast.error(r.erro ?? "Não foi possível consultar a Sefaz");
        })
      }
    >
      <RefreshCw className={pendente ? "size-4 animate-spin" : "size-4"} />
      {pendente ? "Consultando a Sefaz..." : "Consultar agora"}
    </Button>
  );
}

export function BotaoReenviarCiencia({ id }: { id: string }) {
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pendente}
      aria-label="Reenviar a Ciência da Operação"
      title="Reenviar a Ciência da Operação"
      onClick={() =>
        startTransition(async () => {
          const r = await reenviarCienciaDocumento(id);
          if (r.ok) toast.success(r.mensagem ?? "Ciência registrada");
          else toast.error(r.erro ?? "A Sefaz recusou a Ciência");
        })
      }
    >
      <Send className="size-4" /> {pendente ? "Enviando..." : "Ciência"}
    </Button>
  );
}
