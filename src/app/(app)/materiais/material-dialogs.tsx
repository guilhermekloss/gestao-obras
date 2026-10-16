"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { SelectNativo } from "@/components/select-nativo";
import { LabelAjuda } from "@/components/campo-ajuda";
import { CATEGORIAS_MATERIAL, UNIDADES_PADRAO, type MaterialCatalogo } from "@/services/materiais";
import { criarMaterial, atualizarMaterial, mesclarMaterial } from "./actions";
import { GitMerge, Pencil, Plus } from "lucide-react";

const TIPOS = [
  { value: "MATERIAL", label: "Material" },
  { value: "SERVICO", label: "Serviço" },
  { value: "FRETE", label: "Frete" },
  { value: "ENCARGO", label: "Encargo" },
];

export function CamposMaterial({ material }: { material?: MaterialCatalogo }) {
  return (
    <>
      <div className="grid gap-2">
        <LabelAjuda
          htmlFor="nome"
          ajuda="Nome padrão do material, o mesmo para todos os fornecedores (ex.: Cimento CP II 50kg). Notas com descrições diferentes podem ser ligadas a ele depois."
        >
          Nome *
        </LabelAjuda>
        <Input id="nome" name="nome" required defaultValue={material?.nome} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <LabelAjuda htmlFor="unidade" ajuda="Unidade em que o material é comprado: PC, M, M², M³, KG, SC, L, RL, BR, CX...">
            Unidade *
          </LabelAjuda>
          <Input id="unidade" name="unidade" required list="unidades-material" defaultValue={material?.unidade ?? "PC"} />
          <datalist id="unidades-material">
            {UNIDADES_PADRAO.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-2">
          <LabelAjuda htmlFor="tipo" ajuda="Como o custo entra nos relatórios: material, serviço, frete ou encargo.">
            Tipo
          </LabelAjuda>
          <SelectNativo id="tipo" name="tipo" defaultValue={material?.tipo ?? "MATERIAL"}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectNativo>
        </div>
      </div>
      <div className="grid gap-2">
        <LabelAjuda htmlFor="categoria" ajuda="Agrupa os materiais na lista (ex.: Elétrica, Hidráulica). Opcional.">
          Categoria
        </LabelAjuda>
        <Input id="categoria" name="categoria" list="categorias-material" defaultValue={material?.categoria ?? ""} />
        <datalist id="categorias-material">
          {CATEGORIAS_MATERIAL.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </>
  );
}

export function NovoMaterialDialog() {
  return (
    <FormDialog
      titulo="Novo material"
      action={criarMaterial}
      trigger={
        <Button>
          <Plus className="size-4" /> Novo material
        </Button>
      }
    >
      <CamposMaterial />
    </FormDialog>
  );
}

export function EditarMaterialDialog({ material }: { material: MaterialCatalogo }) {
  return (
    <FormDialog
      titulo={`Editar ${material.nome}`}
      action={atualizarMaterial.bind(null, material.id)}
      trigger={
        <Button variant="ghost" size="icon" title="Editar material">
          <Pencil className="size-4" />
        </Button>
      }
    >
      <CamposMaterial material={material} />
    </FormDialog>
  );
}

export function MesclarMaterialButton({
  origemId,
  origemNome,
  opcoes,
}: {
  origemId: string;
  origemNome: string;
  opcoes: { id: string; nome: string; unidade: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState("");
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <GitMerge className="size-4" /> Juntar a outro material
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <p className="text-sm">
        Os lançamentos e apelidos de <b>{origemNome}</b> passam para o material escolhido, e este cadastro é removido.
      </p>
      <Combobox
        options={opcoes.map((o) => ({ value: o.id, label: o.nome, descricao: o.unidade }))}
        value={destino}
        onChange={setDestino}
        placeholder="Juntar com..."
        vazio="Nenhum material encontrado"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!destino || pendente}
          onClick={() =>
            startTransition(async () => {
              const res = await mesclarMaterial(origemId, destino);
              if (res.ok) {
                toast.success("Materiais juntados");
                router.replace(`/materiais/${destino}`);
              } else toast.error(res.erro ?? "Erro ao juntar");
            })
          }
        >
          {pendente ? "Juntando..." : "Juntar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
