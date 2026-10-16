import { CircleAlert } from "lucide-react";
import { LabelAjuda } from "@/components/campo-ajuda";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Id da mensagem de erro de um campo: o campo aponta para ela com `aria-describedby`. */
export const idDoErro = (id: string) => `${id}-erro`;

/** Atributos que ligam o campo à mensagem de erro (leitor de tela lê a mensagem ao focar). */
export function atributosDoErro(id: string, erro?: string | null) {
  return {
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": erro ? idDoErro(id) : undefined,
  } as const;
}

/** Mensagem junto ao campo: ícone e texto, a cor nunca vai sozinha. */
export function MensagemErro({
  id,
  children,
  className,
  focavel = false,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Recebe o foco quando o erro não é de um campo só (rateio, parcelas): leva o leitor de tela até ele. */
  focavel?: boolean;
}) {
  return (
    <p
      id={idDoErro(id)}
      tabIndex={focavel ? -1 : undefined}
      data-foco-erro={focavel ? "" : undefined}
      className={cn("flex items-start gap-1.5 text-sm text-destructive outline-none", className)}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Rótulo + campo + mensagem de erro. O campo recebe `id` e `atributosDoErro(id, erro)` de quem usa;
 * aqui só se desenha o conjunto.
 */
export function CampoForm({
  id,
  rotulo,
  ajuda,
  tituloAjuda,
  erro,
  dica,
  className,
  rotuloOculto,
  children,
}: {
  id: string;
  rotulo: React.ReactNode;
  ajuda?: React.ReactNode;
  tituloAjuda?: string;
  erro?: string | null;
  dica?: React.ReactNode;
  className?: string;
  /** Só para leitor de tela (campos de linhas repetidas, onde o cabeçalho já diz o que é). */
  rotuloOculto?: boolean;
  children: React.ReactNode;
}) {
  const classeRotulo = rotuloOculto ? "sr-only" : undefined;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      {ajuda ? (
        <LabelAjuda htmlFor={id} titulo={tituloAjuda} ajuda={ajuda} className={classeRotulo}>
          {rotulo}
        </LabelAjuda>
      ) : (
        <Label htmlFor={id} className={cn("leading-snug", classeRotulo)}>
          {rotulo}
        </Label>
      )}
      {children}
      {erro ? (
        <MensagemErro id={id}>{erro}</MensagemErro>
      ) : (
        dica && <p className="text-sm text-muted-foreground">{dica}</p>
      )}
    </div>
  );
}
