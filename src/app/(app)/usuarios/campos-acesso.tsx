"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { LabelAjuda } from "@/components/campo-ajuda";
import { SelectNativo } from "@/components/select-nativo";
import { ROLE_DESCRICOES, ROLE_LABELS } from "@/services/acesso";

export type ObraOpcao = { id: string; nome: string };

const ROLES: Role[] = ["ADMIN", "ESCRITORIO", "CAMPO"];

export function CamposAcesso({
  obras,
  role: roleInicial = "ESCRITORIO",
  todasObras: todasInicial = true,
  obraIds: obraIdsIniciais = [],
}: {
  obras: ObraOpcao[];
  role?: Role;
  todasObras?: boolean;
  obraIds?: string[];
}) {
  const [role, setRole] = useState<Role>(roleInicial);
  const [todas, setTodas] = useState(todasInicial);

  return (
    <>
      <div className="grid gap-2">
        <LabelAjuda
          htmlFor="role"
          titulo="Papel do usuário"
          ajuda="Admin: acesso total, inclusive usuários e convites. Escritório: lança notas, obras, orçamento e financeiro. Campo: diário de obra, fotos e avanço físico, sem valores financeiros."
        >
          Papel
        </LabelAjuda>
        <SelectNativo id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectNativo>
        <p className="text-xs text-muted-foreground">{ROLE_DESCRICOES[role]}</p>
      </div>

      {role === "CAMPO" && (
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Obras que pode acessar</legend>
          <label className="flex items-center gap-2 text-sm">
            {/* hidden + checkbox: o servidor sabe que o campo existe mesmo desmarcado */}
            <input type="hidden" name="todasObras" value={todas ? "on" : "off"} />
            <input
              type="checkbox"
              checked={todas}
              onChange={(e) => setTodas(e.target.checked)}
              className="size-4"
            />
            Todas as obras (inclusive as que forem criadas depois)
          </label>
          {!todas && (
            <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
              {obras.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma obra cadastrada.</p>}
              {obras.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="obraIds"
                    value={o.id}
                    defaultChecked={obraIdsIniciais.includes(o.id)}
                    className="size-4"
                  />
                  {o.nome}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}
