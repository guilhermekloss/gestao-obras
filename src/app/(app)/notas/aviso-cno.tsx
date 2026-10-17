"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Building2, CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarCno } from "@/services/cno";
import type { ObraDoCno } from "@/services/obras";
import { vincularCnoAObra } from "../obras/actions";

type ObraEscolhida = { id: string; nome: string; cno?: string | null };

const CAIXA = "flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm";
const TOM = {
  ok: "border-estado-pago-borda bg-estado-pago text-estado-pago-fg",
  info: "border-estado-andamento-borda bg-estado-andamento text-estado-andamento-fg",
  atencao: "border-estado-atencao-borda bg-estado-atencao text-estado-atencao-fg",
};

// CNO lido da nota × obras cadastradas: confirma a obra pré-escolhida, oferece a certa ou grava o CNO na escolhida.
export function AvisoCno({
  cno,
  obrasDoCno,
  obraEscolhida,
  onUsarObra,
  onCnoGravado,
}: {
  cno: string;
  obrasDoCno: ObraDoCno[];
  /** Obra do rateio quando ele tem uma linha só; com várias obras não há o que gravar. */
  obraEscolhida: ObraEscolhida | undefined;
  onUsarObra: (obraId: string) => void;
  onCnoGravado: (obra: ObraDoCno) => void;
}) {
  const [gravando, startTransition] = useTransition();
  const cnoFormatado = formatarCno(cno);
  const ativas = obrasDoCno.filter((o) => o.ativa);

  if (ativas.length === 1 && obraEscolhida?.id === ativas[0].id) {
    return (
      <div className={`${CAIXA} ${TOM.ok}`} role="status">
        <CheckCircle2 className="size-4 shrink-0" />
        <span>
          Obra identificada pelo CNO <span className="num font-medium">{cnoFormatado}</span>.
        </span>
      </div>
    );
  }

  if (ativas.length > 0) {
    return (
      <div className={`${CAIXA} ${TOM.info}`} role="status">
        <Building2 className="size-4 shrink-0" />
        <span>
          {ativas.length === 1 ? (
            <>
              O CNO <span className="num font-medium">{cnoFormatado}</span> da nota é da obra {ativas[0].nome}.
            </>
          ) : (
            <>
              O CNO <span className="num font-medium">{cnoFormatado}</span> está em {ativas.length} obras:
            </>
          )}
        </span>
        {ativas
          .filter((o) => o.id !== obraEscolhida?.id)
          .map((o) => (
            <Button key={o.id} type="button" size="sm" variant="outline" onClick={() => onUsarObra(o.id)}>
              Usar {o.nome}
            </Button>
          ))}
      </div>
    );
  }

  if (obrasDoCno.length > 0) {
    return (
      <div className={`${CAIXA} ${TOM.atencao}`} role="status">
        <TriangleAlert className="size-4 shrink-0" />
        <span>
          O CNO <span className="num font-medium">{cnoFormatado}</span> da nota é da obra{" "}
          {obrasDoCno.map((o) => o.nome).join(", ")}, que não está em andamento. Escolha a obra do rateio.
        </span>
      </div>
    );
  }

  const podeGravar = obraEscolhida && !obraEscolhida.cno;
  return (
    <div className={`${CAIXA} ${TOM.atencao}`} role="status">
      <TriangleAlert className="size-4 shrink-0" />
      <span>
        A nota cita o CNO <span className="num font-medium">{cnoFormatado}</span>, que não está em nenhuma obra.
        {obraEscolhida?.cno && (
          <>
            {" "}
            A obra {obraEscolhida.nome} tem outro CNO ({formatarCno(obraEscolhida.cno)}): confira a obra.
          </>
        )}
      </span>
      {podeGravar && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={gravando}
          onClick={() =>
            startTransition(async () => {
              const r = await vincularCnoAObra(obraEscolhida.id, cno);
              if (!r.ok) {
                toast.error(r.erro ?? "Não foi possível gravar o CNO.");
                return;
              }
              toast.success(`CNO gravado na obra ${obraEscolhida.nome}: as próximas notas com ele já vêm ligadas.`);
              onCnoGravado({ id: obraEscolhida.id, nome: obraEscolhida.nome, ativa: true });
            })
          }
        >
          {gravando ? "Gravando..." : `Gravar este CNO em ${obraEscolhida.nome}`}
        </Button>
      )}
    </div>
  );
}
