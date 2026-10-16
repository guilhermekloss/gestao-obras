import type { Metadata } from "next";
import { exigirPapel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/services/acesso";
import { chaveEmail } from "@/services/protecao-login";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { StatusBadge } from "@/components/status-badge";
import { LogOut } from "lucide-react";
import { encerrarMinhasSessoes } from "./actions";
import { SenhaForm } from "./senha-form";

export const metadata: Metadata = { title: "Minha conta" };

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function ContaPage() {
  const usuario = await exigirPapel();
  const acessos = await prisma.tentativaLogin.findMany({
    where: { email: chaveEmail(usuario.email) },
    orderBy: { criadoEm: "desc" },
    take: 10,
    select: { id: true, criadoEm: true, ip: true, sucesso: true },
  });

  const colunasAcessos: ColunaDados<(typeof acessos)[number]>[] = [
    { id: "quando", titulo: "Quando", papel: "titulo", celula: (a) => dataHora.format(a.criadoEm) },
    {
      id: "ip",
      titulo: "Origem (IP)",
      classe: "font-mono text-xs",
      celula: (a) => a.ip ?? "—",
    },
    {
      id: "resultado",
      titulo: "Resultado",
      papel: "estado",
      celula: (a) =>
        a.sucesso ? (
          <StatusBadge estado="pago">Entrou</StatusBadge>
        ) : (
          <StatusBadge estado="atencao">Senha errada</StatusBadge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl">Minha conta</h1>
        <p className="text-sm text-muted-foreground">
          {usuario.nome} · {usuario.email} · <Badge variant="secondary">{ROLE_LABELS[usuario.role]}</Badge>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>Não reaproveite a senha de outro site e não compartilhe sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <SenhaForm nome={usuario.nome} email={usuario.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acessos recentes</CardTitle>
          <CardDescription>
            Não reconhece algum? Troque a senha e encerre as sessões — e avise o administrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {acessos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum acesso registrado ainda.</p>
          ) : (
            <ListaDeDados
              legenda="Acessos recentes"
              linhas={acessos}
              chave={(a) => a.id}
              colunas={colunasAcessos}
            />
          )}
          <form action={encerrarMinhasSessoes}>
            <Button type="submit" variant="outline">
              <LogOut className="size-4" /> Sair de todos os aparelhos
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
