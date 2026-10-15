import Link from "next/link";
import { ROLE_LABELS } from "@/services/acesso";
import { formatarData, formatarTempoRelativo } from "@/lib/format";
import { dataDoRdo } from "@/services/rdo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { carregarEquipeDaObra, listarAtividades } from "../../../usuarios/dados";
import { FeedAtividades } from "../../../usuarios/feed-atividades";
import type { AbaObraProps } from "./tipos";

export async function AbaEquipe({ obraId, role }: AbaObraProps) {
  const ehAdmin = role === "ADMIN";
  const [equipe, { atividades, total }] = await Promise.all([
    carregarEquipeDaObra(obraId),
    listarAtividades({ obraId }),
  ]);
  const agora = new Date();
  const campo = equipe.filter((u) => u.role === "CAMPO");

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead className="text-right">RDOs</TableHead>
                <TableHead className="text-right">Avanços</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Lançamentos</TableHead>
                <TableHead className="hidden text-right md:table-cell">Último acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipe.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    {ehAdmin ? (
                      <Link href={`/usuarios/${u.id}`} className="font-medium hover:underline">
                        {u.nome}
                      </Link>
                    ) : (
                      <span className="font-medium">{u.nome}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                      {u.acessoEspecifico && <Badge variant="outline">acesso liberado nesta obra</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.rdos || "—"}
                    {u.ultimoRdo && (
                      <span className="block text-xs text-muted-foreground">último {formatarData(dataDoRdo(u.ultimoRdo))}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{u.avancos || "—"}</TableCell>
                  <TableCell className="hidden text-right sm:table-cell">{u.lancamentos || "—"}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                    {u.ultimoAcessoEm ? formatarTempoRelativo(u.ultimoAcessoEm, agora) : "nunca"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
