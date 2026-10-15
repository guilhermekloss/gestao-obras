"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";

export function LinkConvite({
  link,
  mensagem,
  email,
}: {
  link: string;
  mensagem: string;
  email?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  // só renderiza após gerar o link (nunca no servidor): sem risco de hidratação divergente
  const podeCompartilhar = typeof navigator !== "undefined" && "share" in navigator;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar — selecione o link e copie manualmente");
    }
  }

  const assunto = "Convite para a plataforma Gestão de Obras";
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Envie este link para a pessoa. Ele vale para <strong>um cadastro</strong> e não poderá ser exibido de novo —
        se perder, gere um novo link na aba Convites.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
        <Button type="button" variant="outline" size="icon" onClick={copiar} aria-label="Copiar link">
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          render={<a href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer" />}
        >
          <MessageCircle className="size-4" /> WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          render={
            <a
              href={`mailto:${email ?? ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`}
            />
          }
        >
          <Mail className="size-4" /> E-mail
        </Button>
        {podeCompartilhar && (
          <Button
            type="button"
            variant="outline"
            onClick={() => navigator.share({ title: assunto, text: mensagem }).catch(() => {})}
          >
            <Share2 className="size-4" /> Compartilhar
          </Button>
        )}
      </div>
    </div>
  );
}
