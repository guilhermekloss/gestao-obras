"use client";

import { useId } from "react";
import { Camera } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { CampoForm } from "@/components/campo-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarLinhaBase } from "./actions";

// O próprio diálogo é a confirmação: explica o que acontece e só grava no botão de salvar.
export function SalvarLinhaBaseDialog({
  obraId,
  atual,
}: {
  obraId: string;
  /** nome e data da linha oficial de hoje, se houver: ela deixa de ser a oficial */
  atual: { nome: string; criadaEm: string } | null;
}) {
  const campo = useId();
  return (
    <FormDialog
      titulo="Salvar linha de base"
      action={salvarLinhaBase.bind(null, obraId)}
      textoBotao="Confirmar e salvar linha de base"
      trigger={
        <Button id="salvar-linha-base" variant="outline" size="sm">
          <Camera className="size-4" /> Salvar linha de base
        </Button>
      }
    >
      <p className="text-sm">
        Guarda uma foto das datas de todas as etapas como estão agora. Depois, o Gantt mostra quantos dias cada
        etapa variou em relação a ela, e a curva S passa a usar o previsto dela.
      </p>
      {atual && (
        <p className="text-sm text-muted-foreground">
          A linha de base atual ({atual.nome}, de {atual.criadaEm}) deixa de ser a oficial. Ela não é apagada.
        </p>
      )}
      <CampoForm id={campo} rotulo="Nome (opcional)" dica={'Em branco, vira "Linha de base de" + a data de hoje.'}>
        <Input id={campo} name="nome" maxLength={120} placeholder="Ex.: Contrato assinado" autoComplete="off" />
      </CampoForm>
    </FormDialog>
  );
}
