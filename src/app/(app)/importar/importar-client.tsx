"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarMoeda } from "@/lib/format";
import {
  previewImportacao,
  executarImportacao,
  type PreviewImportacao,
} from "./actions";
import { FileSearch, Upload } from "lucide-react";

export function ImportarClient() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<PreviewImportacao | null>(null);
  const [pendente, startTransition] = useTransition();

  function rodar(executar: boolean) {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = executar
        ? await executarImportacao(formData)
        : await previewImportacao(formData);
      if (!res.ok) {
        toast.error(res.erro ?? "Erro na importação");
        return;
      }
      setPreview(res);
      if (executar) {
        toast.success(`${res.importadas} nota(s) importada(s)`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="csvItens">CSV de itens (quantitativo)</Label>
          <Input id="csvItens" name="csvItens" type="file" accept=".csv,text/csv" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="csvFinanceiro">CSV financeiro (notas/parcelas)</Label>
          <Input id="csvFinanceiro" name="csvFinanceiro" type="file" accept=".csv,text/csv" required />
        </div>
      </form>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => rodar(false)} disabled={pendente}>
          <FileSearch className="size-4" />
          {pendente ? "Processando..." : "Pré-visualizar"}
        </Button>
        {preview?.ok && preview.importadas === undefined && (
          <Button onClick={() => rodar(true)} disabled={pendente}>
            <Upload className="size-4" /> Confirmar importação
          </Button>
        )}
      </div>

      {preview?.ok && (
        <Card>
          <CardHeader>
            <CardTitle>
              {preview.importadas !== undefined
                ? `Importação concluída: ${preview.importadas} nota(s)`
                : "Prévia da importação"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Resumo titulo="Notas" valor={String(preview.totalNotas)} />
              <Resumo titulo="Itens" valor={String(preview.totalItens)} />
              <Resumo titulo="Parcelas" valor={String(preview.totalParcelas)} />
              <Resumo titulo="Fornecedores novos" valor={String(preview.fornecedoresNovos)} />
              <Resumo titulo="Já existentes (puladas)" valor={String(preview.notasJaExistentes)} />
              <Resumo titulo="Valor total" valor={formatarMoeda(preview.valorTotalCents ?? 0)} />
            </div>

            {(preview.inconsistencias?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                  {preview.inconsistencias!.length} inconsistência(s) — importadas mesmo assim, revise depois:
                </p>
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                  {preview.inconsistencias!.map((inc, i) => (
                    <li key={i}>• {inc}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="font-semibold">{valor}</p>
    </div>
  );
}
