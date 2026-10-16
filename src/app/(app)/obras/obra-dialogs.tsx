"use client";

import type { Obra } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelAjuda } from "@/components/campo-ajuda";
import { SelectNativo } from "@/components/select-nativo";
import { criarObra, atualizarObra } from "./actions";
import { dataParaInput } from "@/lib/format";
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
        <LabelAjuda htmlFor="nome" ajuda="Nome pelo qual você identifica a obra no dia a dia (ex.: Lote 03, Residência Silva).">
          Nome *
        </LabelAjuda>
        <Input id="nome" name="nome" required defaultValue={obra?.nome} placeholder="Lote 03" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <LabelAjuda htmlFor="codigo" ajuda="Sigla curta e única para identificar a obra em listas, filtros e relatórios (ex.: L03).">
            Código *
          </LabelAjuda>
          <Input id="codigo" name="codigo" required defaultValue={obra?.codigo} placeholder="L03" />
        </div>
        <div className="grid gap-2">
          <LabelAjuda
            htmlFor="cno"
            titulo="CNO — Cadastro Nacional de Obras"
            ajuda="Registro da obra na Receita Federal (substituiu a antiga matrícula CEI). Serve para o INSS da construção e para emitir a CND da obra. Como preencher: informe os 12 dígitos do CNO gerado no portal e-CAC. Deixe vazio se a obra ainda não foi registrada."
          >
            CNO
          </LabelAjuda>
          <Input id="cno" name="cno" defaultValue={obra?.cno ?? ""} />
        </div>
      </div>
      <div className="grid gap-2">
        <LabelAjuda htmlFor="endereco" ajuda="Local da obra. Ajuda a localizá-la e aparece nos relatórios.">
          Endereço
        </LabelAjuda>
        <Input id="endereco" name="endereco" defaultValue={obra?.endereco ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <LabelAjuda htmlFor="status" ajuda="Situação atual da obra. Obras em Planejamento ou Em andamento são as que aparecem nas telas de lançamento de nota.">
            Status
          </LabelAjuda>
          <SelectNativo id="status" name="status" defaultValue={obra?.status ?? "ANDAMENTO"}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-2">
          <LabelAjuda htmlFor="inicioEm" ajuda="Data em que a obra começou (ou a previsão de início). Usada para acompanhar prazos.">
            Início
          </LabelAjuda>
          <Input
            id="inicioEm"
            name="inicioEm"
            type="date"
            defaultValue={obra?.inicioEm ? dataParaInput(obra.inicioEm) : ""}
          />
        </div>
      </div>
    </>
  );
}

export function NovaObraDialog({ rotulo = "Nova obra", grande = false }: { rotulo?: string; grande?: boolean }) {
  return (
    <FormDialog
      titulo="Nova obra"
      action={criarObra}
      trigger={
        <Button size={grande ? "lg" : "default"}>
          <Plus className="size-4" /> {rotulo}
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
