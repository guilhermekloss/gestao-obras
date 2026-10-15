"use client";

import type { Role } from "@prisma/client";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelAjuda } from "@/components/campo-ajuda";
import { SENHA_MINIMA } from "@/services/convite";
import { criarUsuario, atualizarUsuario } from "./actions";
import { CamposAcesso, type ObraOpcao } from "./campos-acesso";
import { Pencil, UserPlus } from "lucide-react";

type UsuarioSeguro = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  todasObras: boolean;
  obraIds: string[];
};

function CamposUsuario({ usuario, obras }: { usuario?: UsuarioSeguro; obras: ObraOpcao[] }) {
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
              ? `Deixe em branco para manter a senha atual. Para trocar, digite a nova senha (mínimo de ${SENHA_MINIMA} caracteres) — a pessoa é desconectada de todos os aparelhos.`
              : `Mínimo de ${SENHA_MINIMA} caracteres. Prefere que a pessoa crie a própria senha? Use “Convidar por link”.`
          }
        >
          {usuario ? "Nova senha (deixe vazio para manter)" : "Senha *"}
        </LabelAjuda>
        <Input id="senha" name="senha" type="password" required={!usuario} minLength={SENHA_MINIMA} maxLength={72} autoComplete="new-password" />
      </div>
      <CamposAcesso
        obras={obras}
        role={usuario?.role}
        todasObras={usuario?.todasObras}
        obraIds={usuario?.obraIds}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={usuario?.ativo ?? true} className="size-4" />
        Ativo — desmarque para cortar o acesso na hora (o histórico do usuário é mantido)
      </label>
    </>
  );
}

export function NovoUsuarioDialog({ obras }: { obras: ObraOpcao[] }) {
  return (
    <FormDialog
      titulo="Novo usuário com senha"
      action={criarUsuario}
      trigger={
        <Button variant="outline">
          <UserPlus className="size-4" /> Cadastrar manualmente
        </Button>
      }
    >
      <CamposUsuario obras={obras} />
    </FormDialog>
  );
}

export function EditarUsuarioDialog({
  usuario,
  obras,
  comTexto = false,
}: {
  usuario: UsuarioSeguro;
  obras: ObraOpcao[];
  comTexto?: boolean;
}) {
  return (
    <FormDialog
      titulo={`Editar ${usuario.nome}`}
      action={atualizarUsuario.bind(null, usuario.id)}
      trigger={
        comTexto ? (
          <Button variant="outline" size="sm">
            <Pencil className="size-4" /> Editar acesso
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Editar ${usuario.nome}`}>
            <Pencil className="size-4" />
          </Button>
        )
      }
    >
      <CamposUsuario usuario={usuario} obras={obras} />
    </FormDialog>
  );
}
