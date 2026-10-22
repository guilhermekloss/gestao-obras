"use client";

import { useId } from "react";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarMedicao, editarMedicao } from "./actions";
import { dataParaInput, percentBpParaEditavel } from "@/lib/format";
import { Pencil, Plus } from "lucide-react";

type MedicaoEditavel = { id: string; data: string; percentBp: number; obs: string | null };

// Um formulário para lançar e para corrigir: com `medicao`, abre preenchido e grava por editarMedicao.
function CamposMedicao({ placeholder, medicao }: { placeholder?: string; medicao?: MedicaoEditavel }) {
  const base = useId();
  const hoje = dataParaInput(new Date());
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${base}-percent`}>% executado (acumulado)</Label>
          <Input
            id={`${base}-percent`}
            name="percent"
            inputMode="decimal"
            required
            placeholder={placeholder}
            defaultValue={medicao ? percentBpParaEditavel(medicao.percentBp) : undefined}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${base}-data`}>Data</Label>
          <Input
            id={`${base}-data`}
            name="data"
            type="date"
            required
            max={hoje}
            defaultValue={medicao?.data ?? hoje}
            className="h-11"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${base}-obs`}>Observação</Label>
        <Textarea id={`${base}-obs`} name="obs" rows={2} defaultValue={medicao?.obs ?? undefined} />
      </div>
    </>
  );
}

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
      <CamposMedicao placeholder={`atual: ${atualPercent.toLocaleString("pt-BR")}%`} />
    </FormDialog>
  );
}

export function EditarMedicaoDialog({ etapaNome, medicao }: { etapaNome: string; medicao: MedicaoEditavel }) {
  return (
    <FormDialog
      titulo={`Corrigir avanço — ${etapaNome}`}
      action={editarMedicao.bind(null, medicao.id)}
      textoBotao="Salvar correção"
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Corrigir o avanço de ${etapaNome}`}>
          <Pencil className="size-4 text-muted-foreground" />
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        O valor precisa ficar entre os avanços das datas vizinhas da mesma etapa.
      </p>
      {/* key: remonta com os valores salvos */}
      <CamposMedicao key={`${medicao.data}:${medicao.percentBp}:${medicao.obs ?? ""}`} medicao={medicao} />
    </FormDialog>
  );
}
