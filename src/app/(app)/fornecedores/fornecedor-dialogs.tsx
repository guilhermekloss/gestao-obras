"use client";

import type { Fornecedor } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelAjuda } from "@/components/campo-ajuda";
import { Textarea } from "@/components/ui/textarea";
import { criarFornecedor, atualizarFornecedor } from "./actions";
import { Plus, Pencil } from "lucide-react";

function CamposFornecedor({ fornecedor }: { fornecedor?: Fornecedor }) {
  return (
    <>
      <div className="grid gap-2">
        <LabelAjuda htmlFor="nome" ajuda="Nome do fornecedor. Para empresas, use a razão social; para autônomos, o nome completo.">
          Nome / Razão social *
        </LabelAjuda>
        <Input id="nome" name="nome" required defaultValue={fornecedor?.nome} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <LabelAjuda
            htmlFor="cnpj"
            titulo="CNPJ — Cadastro Nacional da Pessoa Jurídica"
            ajuda="Documento da empresa, com 14 dígitos. Opcional, mas evita cadastrar o mesmo fornecedor duas vezes e permite buscá-lo pelo CNPJ. Formato: 00.000.000/0000-00."
          >
            CNPJ
          </LabelAjuda>
          <Input id="cnpj" name="cnpj" defaultValue={fornecedor?.cnpj ?? ""} placeholder="00.000.000/0000-00" />
        </div>
        <div className="grid gap-2">
          <LabelAjuda htmlFor="fone" ajuda="Telefone de contato do fornecedor, com DDD.">
            Telefone
          </LabelAjuda>
          <Input id="fone" name="fone" defaultValue={fornecedor?.fone ?? ""} />
        </div>
      </div>
      <div className="grid gap-2">
        <LabelAjuda htmlFor="obs" ajuda="Anotações livres: condições de pagamento, contato preferido, prazo de entrega, etc.">
          Observações
        </LabelAjuda>
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
        <Button variant="ghost" size="icon" aria-label={`Editar ${fornecedor.nome}`}>
          <Pencil className="size-4" />
        </Button>
      }
    >
      <CamposFornecedor fornecedor={fornecedor} />
    </FormDialog>
  );
}
