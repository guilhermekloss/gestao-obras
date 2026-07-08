"use client";

import type { Obra } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/select-nativo";
import { criarObra, atualizarObra } from "./actions";
import { Plus, Pencil } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PLANEJAMENTO: "Planejamento",
  ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  PAUSADA: "Pausada",
};

function CamposObra({ obra }: { obra?: Obra }) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" required defaultValue={obra?.nome} placeholder="Lote 03" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="codigo">Código *</Label>
          <Input id="codigo" name="codigo" required defaultValue={obra?.codigo} placeholder="L03" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cno">CNO</Label>
          <Input id="cno" name="cno" defaultValue={obra?.cno ?? ""} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="endereco">Endereço</Label>
        <Input id="endereco" name="endereco" defaultValue={obra?.endereco ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <SelectNativo id="status" name="status" defaultValue={obra?.status ?? "ANDAMENTO"}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="inicioEm">Início</Label>
          <Input
            id="inicioEm"
            name="inicioEm"
            type="date"
            defaultValue={obra?.inicioEm ? new Date(obra.inicioEm).toISOString().slice(0, 10) : ""}
          />
        </div>
      </div>
    </>
  );
}

export function NovaObraDialog() {
  return (
    <FormDialog
      titulo="Nova obra"
      action={criarObra}
      trigger={
        <Button>
          <Plus className="size-4" /> Nova obra
        </Button>
      }
    >
      <CamposObra />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="criarEtapasPadrao" defaultChecked className="size-4" />
        Criar etapas padrão (Fundação, Estrutura, Alvenaria, Instalações, Acabamento)
      </label>
    </FormDialog>
  );
}

export function EditarObraDialog({ obra }: { obra: Obra }) {
  const action = atualizarObra.bind(null, obra.id);
  return (
    <FormDialog
      titulo={`Editar ${obra.nome}`}
      action={action}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-4" /> Editar
        </Button>
      }
    >
      <CamposObra obra={obra} />
    </FormDialog>
  );
}
