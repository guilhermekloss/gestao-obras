"use client";

import { Ban, LockOpen } from "lucide-react";
import { CampoForm } from "@/components/campo-form";
import { ConfirmButton } from "@/components/confirm-button";
import { FormDialog } from "@/components/form-dialog";
import { SelectNativo } from "@/components/select-nativo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DURACOES_MANUAIS_MS } from "@/services/protecao-ativa";
import { bloquearIp, liberarBloqueio } from "./actions";

export function LiberarBloqueio({ id, origem }: { id: string; origem: string }) {
  return (
    <ConfirmButton
      action={liberarBloqueio.bind(null, id)}
      mensagem={`Liberar o acesso de ${origem} agora? Se as falhas continuarem, o próximo bloqueio será mais longo.`}
      variant="outline"
      size="sm"
    >
      <LockOpen className="size-4" /> <span className="hidden sm:inline">Liberar agora</span>
    </ConfirmButton>
  );
}

export function BloquearIpDialog() {
  return (
    <FormDialog
      titulo="Bloquear um IP"
      action={bloquearIp}
      textoBotao="Bloquear"
      trigger={
        <Button variant="outline">
          <Ban className="size-4" /> Bloquear IP
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        O endereço deixa de abrir qualquer página do sistema até o prazo acabar ou alguém liberar. Use para um IP que aparece nos
        alertas de ataque. Vale em até 1 minuto em todas as instâncias.
      </p>
      <CampoForm id="bloqueio-ip" rotulo="Endereço IP">
        <Input id="bloqueio-ip" name="ip" required maxLength={64} placeholder="203.0.113.7" autoComplete="off" />
      </CampoForm>
      <CampoForm id="bloqueio-duracao" rotulo="Por quanto tempo">
        <SelectNativo id="bloqueio-duracao" name="duracao" defaultValue="24 horas">
          {Object.keys(DURACOES_MANUAIS_MS).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectNativo>
      </CampoForm>
    </FormDialog>
  );
}
