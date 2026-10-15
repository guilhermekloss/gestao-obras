"use client";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarMedicao } from "./actions";
import { dataParaInput } from "@/lib/format";
import { Plus } from "lucide-react";

export function NovaMedicaoDialog({
  etapaId,
  etapaNome,
  atualPercent,
}: {
  etapaId: string;
  etapaNome: string;
  atualPercent: number;
}) {
  return (
    <FormDialog
      titulo={`Lançar avanço — ${etapaNome}`}
      action={criarMedicao}
      textoBotao="Registrar avanço"
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" /> Avanço
        </Button>
      }
    >
      <input type="hidden" name="etapaId" value={etapaId} />
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="percent">% executado (acumulado)</Label>
          <Input
            id="percent"
            name="percent"
            inputMode="decimal"
            required
            placeholder={`atual: ${atualPercent.toLocaleString("pt-BR")}%`}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="data">Data</Label>
          <Input
            id="data"
            name="data"
            type="date"
            required
            defaultValue={dataParaInput(new Date())}
            className="h-11"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="obs">Observação</Label>
        <Textarea id="obs" name="obs" rows={2} />
      </div>
    </FormDialog>
  );
}
