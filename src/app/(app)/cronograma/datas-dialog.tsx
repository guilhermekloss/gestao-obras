"use client";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarDatasEtapas } from "./actions";
import { CalendarRange } from "lucide-react";

type EtapaDatas = {
  id: string;
  nome: string;
  inicioPrevisto: string | null; // "aaaa-mm-dd"
  fimPrevisto: string | null;
};

/** Edição das datas previstas (linha de base) de todas as etapas da obra de uma vez. */
export function EditarDatasDialog({ obraId, etapas }: { obraId: string; etapas: EtapaDatas[] }) {
  return (
    <FormDialog
      titulo="Datas previstas das etapas"
      action={salvarDatasEtapas.bind(null, obraId)}
      textoBotao="Salvar datas"
      trigger={
        <Button variant="outline" size="sm">
          <CalendarRange className="size-4" /> Editar datas
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        Deixe em branco as etapas ainda sem planejamento. O previsto de cada etapa é distribuído
        igualmente pelos dias entre o início e o fim.
      </p>
      <div className="hidden grid-cols-[1fr_9.5rem_9.5rem] gap-2 text-xs text-muted-foreground sm:grid">
        <span>Etapa</span>
        <span>Início</span>
        <span>Fim</span>
      </div>
      <div className="grid gap-3 sm:gap-2">
        {etapas.map((e) => (
          // a key muda com as datas salvas: remonta os inputs não controlados em vez de trocar o defaultValue
          <div
            key={`${e.id}:${e.inicioPrevisto}:${e.fimPrevisto}`}
            className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_9.5rem_9.5rem]"
          >
            <span className="col-span-2 text-sm font-medium sm:col-span-1">{e.nome}</span>
            <Input
              type="date"
              name={`inicio-${e.id}`}
              aria-label={`Início previsto de ${e.nome}`}
              defaultValue={e.inicioPrevisto ?? ""}
            />
            <Input
              type="date"
              name={`fim-${e.id}`}
              aria-label={`Fim previsto de ${e.nome}`}
              defaultValue={e.fimPrevisto ?? ""}
            />
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
