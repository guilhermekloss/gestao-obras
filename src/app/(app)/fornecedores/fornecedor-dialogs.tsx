"use client";

import type { Fornecedor } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarFornecedor, atualizarFornecedor } from "./actions";
import { Plus, Pencil } from "lucide-react";

function CamposFornecedor({ fornecedor }: { fornecedor?: Fornecedor }) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome / Razão social *</Label>
        <Input id="nome" name="nome" required defaultValue={fornecedor?.nome} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input id="cnpj" name="cnpj" defaultValue={fornecedor?.cnpj ?? ""} placeholder="00.000.000/0000-00" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fone">Telefone</Label>
          <Input id="fone" name="fone" defaultValue={fornecedor?.fone ?? ""} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="obs">Observações</Label>
        <Textarea id="obs" name="obs" rows={2} defaultValue={fornecedor?.obs ?? ""} />
      </div>
    </>
  );
}

export function NovoFornecedorDialog() {
  return (
    <FormDialog
      titulo="Novo fornecedor"
      action={criarFornecedor}
      trigger={
        <Button>
          <Plus className="size-4" /> Novo fornecedor
        </Button>
      }
    >
      <CamposFornecedor />
    </FormDialog>
  );
}

export function EditarFornecedorDialog({ fornecedor }: { fornecedor: Fornecedor }) {
  return (
    <FormDialog
      titulo={`Editar ${fornecedor.nome}`}
      action={atualizarFornecedor.bind(null, fornecedor.id)}
      trigger={
        <Button variant="ghost" size="icon">
          <Pencil className="size-4" />
        </Button>
      }
    >
      <CamposFornecedor fornecedor={fornecedor} />
    </FormDialog>
  );
}
