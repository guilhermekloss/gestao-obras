"use client";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelAjuda } from "@/components/campo-ajuda";
import { SelectNativo } from "@/components/select-nativo";
import { criarUsuario, atualizarUsuario } from "./actions";
import { Plus, Pencil } from "lucide-react";

type UsuarioSeguro = {
  id: string;
  nome: string;
  email: string;
  role: "ADMIN" | "ESCRITORIO" | "CAMPO";
  ativo: boolean;
};

const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "ESCRITORIO", label: "Escritório" },
  { value: "CAMPO", label: "Campo" },
];

function CamposUsuario({ usuario }: { usuario?: UsuarioSeguro }) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" required defaultValue={usuario?.nome} />
      </div>
      <div className="grid gap-2">
        <LabelAjuda htmlFor="email" ajuda="E-mail usado para entrar no sistema. Precisa ser único — não pode se repetir entre usuários.">
          E-mail *
        </LabelAjuda>
        <Input id="email" name="email" type="email" required defaultValue={usuario?.email} />
      </div>
      <div className="grid gap-2">
        <LabelAjuda
          htmlFor="senha"
          ajuda={
            usuario
              ? "Deixe em branco para manter a senha atual. Para trocar, digite a nova senha (mínimo de 6 caracteres)."
              : "Mínimo de 6 caracteres. O usuário poderá alterá-la depois."
          }
        >
          {usuario ? "Nova senha (deixe vazio para manter)" : "Senha *"}
        </LabelAjuda>
        <Input id="senha" name="senha" type="password" required={!usuario} minLength={6} />
      </div>
      <div className="grid grid-cols-2 items-end gap-4">
        <div className="grid gap-2">
          <LabelAjuda
            htmlFor="role"
            titulo="Papel do usuário"
            ajuda="Define o que o usuário pode fazer: Admin (acesso total, inclui gestão de usuários); Escritório (lança notas, obras e financeiro); Campo (apenas o diário de obra e fotos no canteiro)."
          >
            Papel
          </LabelAjuda>
          <SelectNativo id="role" name="role" defaultValue={usuario?.role ?? "ESCRITORIO"}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </SelectNativo>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={usuario?.ativo ?? true} className="size-4" />
          Ativo
        </label>
      </div>
    </>
  );
}

export function NovoUsuarioDialog() {
  return (
    <FormDialog
      titulo="Novo usuário"
      action={criarUsuario}
      trigger={
        <Button>
          <Plus className="size-4" /> Novo usuário
        </Button>
      }
    >
      <CamposUsuario />
    </FormDialog>
  );
}

export function EditarUsuarioDialog({ usuario }: { usuario: UsuarioSeguro }) {
  return (
    <FormDialog
      titulo={`Editar ${usuario.nome}`}
      action={atualizarUsuario.bind(null, usuario.id)}
      trigger={
        <Button variant="ghost" size="icon">
          <Pencil className="size-4" />
        </Button>
      }
    >
      <CamposUsuario usuario={usuario} />
    </FormDialog>
  );
}
