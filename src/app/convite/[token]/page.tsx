import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/token";
import { usuarioAtual } from "@/lib/auth";
import { descreverAcessoObras, ROLE_DESCRICOES, ROLE_LABELS } from "@/services/acesso";
import { statusConvite, tokenComFormatoValido } from "@/services/convite";
import { formatarData } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CadastroForm } from "./cadastro-form";

export const metadata: Metadata = {
  title: "Convite · Gestão de Obras",
  // link pessoal: não indexar nem vazar o token como referer
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const MOTIVO: Record<string, string> = {
  ACEITO: "Este convite já foi usado para criar uma conta.",
  EXPIRADO: "Este convite expirou.",
  REVOGADO: "Este convite foi cancelado.",
};

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const convite = tokenComFormatoValido(token)
    ? await prisma.convite.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { criadoPor: { select: { nome: true } } },
      })
    : null;
  const status = convite ? statusConvite(convite) : null;

  if (!convite || status !== "PENDENTE") {
    return (
      <Moldura>
        <CardHeader>
          <CardTitle className="text-2xl">Convite indisponível</CardTitle>
          <CardDescription>
            {status ? MOTIVO[status] : "Link de convite inválido."} Peça um novo link a quem convidou você.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" render={<Link href="/login" />}>
            Já tenho conta — entrar
          </Button>
        </CardContent>
      </Moldura>
    );
  }

  const [obras, logado] = await Promise.all([
    convite.todasObras
      ? Promise.resolve([])
      : prisma.obra.findMany({ where: { id: { in: convite.obraIds } }, select: { nome: true }, orderBy: { codigo: "asc" } }),
    usuarioAtual(),
  ]);

  return (
    <Moldura>
      <CardHeader>
        <CardTitle className="text-2xl">Crie seu acesso</CardTitle>
        <CardDescription>
          {convite.criadoPor ? `${convite.criadoPor.nome} convidou você` : "Você foi convidado(a)"} para a plataforma
          Gestão de Obras.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-md bg-muted/60 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Acesso: </span>
            <strong>{ROLE_LABELS[convite.role]}</strong>
          </p>
          <p className="text-xs text-muted-foreground">{ROLE_DESCRICOES[convite.role]}</p>
          {convite.role === "CAMPO" && (
            <p className="mt-1">
              <span className="text-muted-foreground">Obras: </span>
              {descreverAcessoObras(convite.role, convite.todasObras, obras.map((o) => o.nome))}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Link válido até {formatarData(convite.expiraEm)}.</p>
        </div>
        {logado && (
          <p className="text-xs text-muted-foreground">
            Você está conectado como {logado.nome}. Ao concluir, entrará com a conta nova.
          </p>
        )}
        <CadastroForm token={token} nome={convite.nome ?? ""} email={convite.email} />
      </CardContent>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </main>
  );
}
