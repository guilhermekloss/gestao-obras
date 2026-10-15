"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/acao";

export function FormDialog({
  trigger,
  titulo,
  action,
  children,
  textoBotao = "Salvar",
}: {
  trigger: React.ReactNode;
  titulo: string;
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  textoBotao?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(formData);
      if (res.ok) {
        toast.success("Salvo com sucesso");
        setAberto(false);
      } else {
        toast.error(res.erro ?? "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger nativeButton={false} render={<span>{trigger}</span>} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          {children}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : textoBotao}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
