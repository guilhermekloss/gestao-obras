"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmação antes de uma ação que muda dinheiro ou dados. Diz o que vai acontecer no título,
 * mostra o que será afetado no corpo e dá ao botão o verbo da ação ("Confirmar pagamento").
 */
export function ConfirmarDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  confirmar,
  voltar = "Voltar",
  pendente = false,
  pendenteRotulo,
  onConfirmar,
  children,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao?: React.ReactNode;
  confirmar: string;
  voltar?: string;
  pendente?: boolean;
  pendenteRotulo?: string;
  onConfirmar: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(a) => !(pendente && !a) && onAbertoChange(a)}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug">{titulo}</DialogTitle>
          {descricao && <DialogDescription className="text-base">{descricao}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pendente} onClick={() => onAbertoChange(false)}>
            {voltar}
          </Button>
          <Button type="button" disabled={pendente} onClick={onConfirmar}>
            {pendente ? (pendenteRotulo ?? "Salvando...") : confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
