"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { CampoForm } from "@/components/campo-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moverEtapa, renomearEtapa } from "../../actions";

export function RenomearEtapaDialog({ etapaId, nome }: { etapaId: string; nome: string }) {
  const campo = `nome-etapa-${etapaId}`;
  return (
    <FormDialog
      titulo="Renomear etapa"
      action={renomearEtapa.bind(null, etapaId)}
      textoBotao="Salvar nome"
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Renomear a etapa ${nome}`}>
          <Pencil className="size-4 text-muted-foreground" />
        </Button>
      }
    >
      <CampoForm id={campo} rotulo="Nome da etapa">
        {/* key: remonta com o nome salvo (defaultValue não atualiza sozinho) */}
        <Input key={nome} id={campo} name="nome" defaultValue={nome} required maxLength={200} autoComplete="off" />
      </CampoForm>
    </FormDialog>
  );
}

export function MoverEtapaBotoes({
  etapaId,
  nome,
  primeira,
  ultima,
}: {
  etapaId: string;
  nome: string;
  primeira: boolean;
  ultima: boolean;
}) {
  const [pendente, startTransition] = useTransition();

  function mover(direcao: "cima" | "baixo") {
    startTransition(async () => {
      const res = await moverEtapa(etapaId, direcao);
      if (!res.ok) toast.error(res.erro ?? "Não foi possível mover a etapa");
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pendente || primeira}
        aria-label={`Mover a etapa ${nome} para cima`}
        onClick={() => mover("cima")}
      >
        <ArrowUp className="size-4 text-muted-foreground" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pendente || ultima}
        aria-label={`Mover a etapa ${nome} para baixo`}
        onClick={() => mover("baixo")}
      >
        <ArrowDown className="size-4 text-muted-foreground" />
      </Button>
    </>
  );
}
