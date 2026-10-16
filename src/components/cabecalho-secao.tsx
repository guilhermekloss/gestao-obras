import { Check, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de seção recolhível (vai dentro de `AccordionTrigger`). O quadrado do ícone diz o estado:
 * tracejado = falta preencher; cheio com visto = tem conteúdo; âmbar = confere antes de salvar;
 * vermelho = precisa corrigir. O resumo aparece mesmo com a seção fechada.
 */
export function CabecalhoSecao({
  icone: Icone,
  titulo,
  resumo,
  preenchida,
  erro = false,
  aviso = false,
  compacto = false,
}: {
  icone: LucideIcon;
  titulo: string;
  resumo: string;
  preenchida: boolean;
  erro?: boolean;
  aviso?: boolean;
  /** Formulário de escritório: quadrado e título menores que os do campo. */
  compacto?: boolean;
}) {
  const alerta = aviso && !erro;
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "relative grid shrink-0 place-items-center rounded-md border-2",
          compacto ? "size-10" : "size-12",
          erro
            ? "border-estado-vencido-borda bg-estado-vencido text-estado-vencido-fg"
            : alerta
              ? "border-estado-atencao-borda bg-estado-atencao text-estado-atencao-fg"
              : preenchida
                ? "border-estado-no-prazo-borda bg-estado-no-prazo text-estado-no-prazo-fg"
                : "border-dashed border-estado-neutro-borda bg-estado-neutro text-estado-neutro-fg",
        )}
      >
        <Icone className={compacto ? "size-5" : "size-6"} />
        {preenchida && !erro && !alerta && (
          <Check className="absolute -right-1.5 -bottom-1.5 size-5 rounded-full bg-card p-0.5 text-estado-no-prazo-fg ring-1 ring-estado-no-prazo-borda" />
        )}
        {alerta && (
          <TriangleAlert className="absolute -right-1.5 -bottom-1.5 size-5 rounded-full bg-card p-0.5 text-estado-atencao-fg ring-1 ring-estado-atencao-borda" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block leading-snug font-semibold [font-stretch:112%]", compacto ? "text-base" : "text-lg")}>
          {titulo}
        </span>
        <span
          className={cn(
            "block truncate text-sm font-normal",
            erro ? "font-medium text-destructive" : alerta ? "font-medium text-estado-atencao-fg" : "text-muted-foreground",
          )}
        >
          {resumo}
        </span>
      </span>
    </>
  );
}
