"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelAjuda } from "@/components/campo-ajuda";
import { SelectNativo } from "@/components/select-nativo";
import { ConfirmButton } from "@/components/confirm-button";
import { VALIDADE_PADRAO_DIAS, VALIDADES_DIAS } from "@/services/convite";
import { criarConvite, renovarConvite, revogarConvite, type ConviteGerado } from "./actions";
import { CamposAcesso, type ObraOpcao } from "./campos-acesso";
import { LinkConvite } from "./link-convite";
import { Ban, Link2, RefreshCw } from "lucide-react";

type LinkGerado = Required<Pick<ConviteGerado, "link" | "mensagem">> & { email?: string | null };

export function NovoConviteDialog({ obras, grande = false }: { obras: ObraOpcao[]; grande?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [gerado, setGerado] = useState<LinkGerado | null>(null);
  const [pendente, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await criarConvite(formData);
      if (res.ok && res.link && res.mensagem) {
        setGerado({ link: res.link, mensagem: res.mensagem, email: res.email });
      } else {
        toast.error(res.erro ?? "Erro ao gerar o convite");
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setGerado(null);
      }}
    >
      <DialogTrigger
        nativeButton={false}
        render={
          <span>
            <Button size={grande ? "lg" : "default"}>
              <Link2 className="size-4" /> Convidar por link
            </Button>
          </span>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{gerado ? "Convite pronto" : "Convidar por link"}</DialogTitle>
        </DialogHeader>
        {gerado ? (
          <div className="grid gap-4">
            <LinkConvite {...gerado} />
            <Button type="button" variant="secondary" onClick={() => setGerado(null)}>
              Gerar outro convite
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              A pessoa abre o link, preenche nome, e-mail e senha e já entra com o papel e as obras definidos aqui.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="convite-nome">Nome (opcional)</Label>
              <Input id="convite-nome" name="nome" placeholder="Para personalizar a mensagem" />
            </div>
            <div className="grid gap-2">
              <LabelAjuda
                htmlFor="convite-email"
                ajuda="Se preenchido, o cadastro só pode ser feito com este e-mail. Deixe em branco para a pessoa informar o dela."
              >
                E-mail (opcional)
              </LabelAjuda>
              <Input id="convite-email" name="email" type="email" placeholder="pessoa@exemplo.com" />
            </div>
            <CamposAcesso obras={obras} role="CAMPO" />
            <div className="grid gap-2">
              <Label htmlFor="validadeDias">Link válido por</Label>
              <SelectNativo id="validadeDias" name="validadeDias" defaultValue={String(VALIDADE_PADRAO_DIAS)}>
                {VALIDADES_DIAS.map((d) => (
                  <option key={d} value={d}>
                    {d === 1 ? "1 dia" : `${d} dias`}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Gerando..." : "Gerar link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AcoesConvite({ id, podeCancelar }: { id: string; podeCancelar: boolean }) {
  const [gerado, setGerado] = useState<LinkGerado | null>(null);
  const [pendente, startTransition] = useTransition();

  function renovar() {
    startTransition(async () => {
      const res = await renovarConvite(id);
      if (res.ok && res.link && res.mensagem) setGerado({ link: res.link, mensagem: res.mensagem, email: res.email });
      else toast.error(res.erro ?? "Erro ao gerar o link");
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={renovar}>
        <RefreshCw className="size-4" /> <span className="hidden sm:inline">Novo link</span>
      </Button>
      {podeCancelar && (
        <ConfirmButton
          action={revogarConvite.bind(null, id)}
          mensagem="Cancelar este convite? O link deixa de funcionar."
          variant="ghost"
          size="sm"
        >
          <Ban className="size-4" /> <span className="hidden sm:inline">Cancelar</span>
        </ConfirmButton>
      )}
      <Dialog open={gerado !== null} onOpenChange={(v) => !v && setGerado(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo link gerado</DialogTitle>
          </DialogHeader>
          {gerado && (
            <>
              <p className="text-sm text-muted-foreground">O link anterior deixou de funcionar.</p>
              <LinkConvite {...gerado} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
