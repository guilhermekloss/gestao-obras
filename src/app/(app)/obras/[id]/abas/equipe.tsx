import Link from "next/link";
import { ROLE_LABELS } from "@/services/acesso";
import { formatarData, formatarTempoRelativo } from "@/lib/format";
import { dataDoRdo } from "@/services/rdo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { carregarEquipeDaObra, listarAtividades } from "../../../usuarios/dados";
import { FeedAtividades } from "../../../usuarios/feed-atividades";
import type { AbaObraProps } from "./tipos";

export async function AbaEquipe({ obra, role }: AbaObraProps) {
  const obraId = obra.id;
  const ehAdmin = role === "ADMIN";
  const [equipe, { atividades, total }] = await Promise.all([
    carregarEquipeDaObra(obra),
    listarAtividades({ obraId }),
  ]);
  const agora = new Date();
  const campo = equipe.filter((u) => u.role === "CAMPO");

  const colunas: ColunaDados<(typeof equipe)[number]>[] = [
    {
      id: "pessoa",
      titulo: "Pessoa",
      papel: "titulo",
      celula: (u) => (
        <>
          {ehAdmin ? (
            <Link href={`/usuarios/${u.id}`} className={`${LINK_DA_LINHA} font-medium`}>
              {u.nome}
            </Link>
          ) : (
            <span className="font-medium">{u.nome}</span>
          )}
          <span className="mt-0.5 flex flex-wrap gap-1">
            <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
            {u.acessoEspecifico && <Badge variant="outline">acesso liberado nesta obra</Badge>}
          </span>
        </>
      ),
    },
    {
      id: "rdos",
      titulo: "RDOs",
      numerica: true,
      celula: (u) =>
        u.rdos ? (
          <>
            {u.rdos}
            {u.ultimoRdo && (
              <span className="ml-1.5 text-xs text-muted-foreground tabela:ml-0 tabela:block">
                último {formatarData(dataDoRdo(u.ultimoRdo))}
              </span>
            )}
          </>
        ) : null,
    },
    { id: "avancos", titulo: "Avanços", numerica: true, celula: (u) => u.avancos || null },
    { id: "lancamentos", titulo: "Lançamentos", numerica: true, celula: (u) => u.lancamentos || null },
    {
      id: "acesso",
      titulo: "Último acesso",
      numerica: true,
      classe: "tabela:text-muted-foreground",
      celula: (u) => (u.ultimoAcessoEm ? formatarTempoRelativo(u.ultimoAcessoEm, agora) : "nunca"),
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Quem tem acesso</CardTitle>
            <CardDescription>
              {campo.length === 0
                ? "Nenhuma pessoa de campo com acesso a esta obra."
                : `${campo.length} ${campo.length === 1 ? "pessoa" : "pessoas"} de campo; escritório e admin veem todas as obras.`}
            </CardDescription>
          </div>
          {ehAdmin && (
            <Button variant="outline" size="sm" render={<Link href="/usuarios" />}>
              Gerenciar acessos
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ListaDeDados
            legenda="Quem tem acesso"
            linhas={equipe}
            chave={(u) => u.id}
            colunas={colunas}
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Atividade na obra</CardTitle>
            <CardDescription>Últimas ações registradas que tocaram esta obra.</CardDescription>
          </div>
          {ehAdmin && total > atividades.length && (
            <Button variant="outline" size="sm" render={<Link href={`/usuarios?aba=atividade&obra=${obraId}`} />}>
              Ver todas
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <FeedAtividades atividades={atividades.slice(0, 15)} linkUsuario={ehAdmin} vazio="Nenhuma ação registrada nesta obra ainda." />
        </CardContent>
      </Card>
    </div>
  );
}
