import Link from "next/link";
import { Building2, HardHat, History, KeyRound, ReceiptText, type LucideIcon } from "lucide-react";
import { EstadoVazio } from "@/components/estado-vazio";
import { categoriaDoTipo, type CategoriaAtividade } from "@/services/atividade";
import { formatarData, formatarTempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AtividadeDoFeed } from "./dados";

const ICONE: Record<CategoriaAtividade, { Icone: LucideIcon; cor: string }> = {
  financeiro: { Icone: ReceiptText, cor: "bg-estado-no-prazo text-estado-no-prazo-fg" },
  cadastro: { Icone: Building2, cor: "bg-estado-andamento text-estado-andamento-fg" },
  campo: { Icone: HardHat, cor: "bg-estado-atencao text-estado-atencao-fg" },
  acesso: { Icone: KeyRound, cor: "bg-estado-neutro text-estado-neutro-fg" },
};

export function FeedAtividades({
  atividades,
  mostrarUsuario = true,
  linkUsuario = true,
  vazio = "As ações feitas na plataforma aparecem aqui.",
}: {
  atividades: AtividadeDoFeed[];
  mostrarUsuario?: boolean;
  linkUsuario?: boolean;
  vazio?: string;
}) {
  if (atividades.length === 0) {
    return (
      <EstadoVazio compacto nivel={3} icone={History} titulo="Nenhuma ação registrada">
        {vazio}
      </EstadoVazio>
    );
  }
  const agora = new Date();
  return (
    <ol className="divide-y">
      {atividades.map((a) => {
        const { Icone, cor } = ICONE[categoriaDoTipo(a.tipo) ?? "cadastro"];
        return (
          <li key={a.id} className="flex items-start gap-3 py-3">
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", cor)}>
              <Icone className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="break-words">
                {mostrarUsuario &&
                  (a.usuario ? (
                    linkUsuario ? (
                      <Link href={`/usuarios/${a.usuario.id}`} className="font-medium hover:underline">
                        {a.usuario.nome}
                      </Link>
                    ) : (
                      <span className="font-medium">{a.usuario.nome}</span>
                    )
                  ) : (
                    <span className="font-medium">Usuário removido</span>
                  ))}
                {mostrarUsuario && " · "}
                {a.link ? (
                  <Link href={a.link} className="hover:underline">
                    {a.descricao}
                  </Link>
                ) : (
                  a.descricao
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <time dateTime={a.criadoEm.toISOString()} title={formatarData(a.criadoEm)}>
                  {formatarTempoRelativo(a.criadoEm, agora)}
                </time>
                {a.obras.map((o) => (
                  <Link key={o.id} href={`/obras/${o.id}`} className="hover:text-foreground hover:underline">
                    {o.nome}
                  </Link>
                ))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
