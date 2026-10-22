import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/token";
import { ipDaRequisicao, usuarioAtual } from "@/lib/auth";
import { eventoSeguranca } from "@/lib/log-seguranca";
import { bloqueioAtivo, ipVigiado, registrarInfracao } from "@/lib/protecao";
import { REGRAS } from "@/services/protecao-ativa";
import { descreverAcessoObras, ROLE_DESCRICOES, ROLE_LABELS } from "@/services/acesso";
import { statusConvite, tokenComFormatoValido } from "@/services/convite";
import { formatarData } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AvisoDeAcesso, FolhaDeAcesso, TituloCota } from "@/components/folha-de-acesso";
import { CadastroForm } from "./cadastro-form";

export const metadata: Metadata = {
  title: "Convite",
  // link pessoal: não indexar nem vazar o token como referer
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const MOTIVO: Record<string, string> = {
  ACEITO: "Este convite já foi usado para criar uma conta.",
  EXPIRADO: "Este convite expirou.",
  REVOGADO: "Este convite foi cancelado.",
};

function ConviteIndisponivel({ titulo }: { titulo: string }) {
  return (
    <FolhaDeAcesso>
      <TituloCota>Convite indisponível</TituloCota>
      <div className="mt-6 grid gap-5 rounded-lg border border-foreground/60 bg-card p-5 sm:p-6">
        <AvisoDeAcesso tom="atencao" titulo={titulo}>
          Peça um novo link a quem convidou você.
        </AvisoDeAcesso>
        <Button variant="outline" size="lg" className="h-12 w-full text-base" render={<Link href="/login" />}>
          Entrar com minha conta
        </Button>
      </div>
    </FolhaDeAcesso>
  );
}

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // varredura de tokens: link inexistente conta por IP; bloqueado não consulta nem o convite certo
  const ip = ipVigiado(await ipDaRequisicao());
  if (ip && (await bloqueioAtivo(["convite"], [ip]))) return <ConviteIndisponivel titulo={REGRAS.convite.mensagem} />;

  const convite = tokenComFormatoValido(token)
    ? await prisma.convite.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { criadoPor: { select: { nome: true } } },
      })
    : null;
  const status = convite ? statusConvite(convite) : null;

  if (!convite) {
    eventoSeguranca("convite_invalido", { ip });
    if (ip) await registrarInfracao("convite", ip);
  }
  if (!convite || status !== "PENDENTE") {
    return <ConviteIndisponivel titulo={status ? MOTIVO[status] : "Link de convite inválido."} />;
  }

  const [obras, logado] = await Promise.all([
    convite.todasObras
      ? Promise.resolve([])
      : prisma.obra.findMany({ where: { id: { in: convite.obraIds } }, select: { nome: true }, orderBy: { codigo: "asc" } }),
    usuarioAtual(),
  ]);

  return (
    <FolhaDeAcesso>
      <TituloCota>Crie seu acesso</TituloCota>
      <p className="mt-3 text-muted-foreground">
        {convite.criadoPor ? `${convite.criadoPor.nome} convidou você` : "Você foi convidado(a)"} para a plataforma
        Gestão de Obras.
      </p>

      <dl className="mt-6 divide-y divide-foreground/40 overflow-hidden rounded-lg border border-foreground/60 bg-card">
        <LinhaDaLegenda rotulo="Acesso">
          <strong>{ROLE_LABELS[convite.role]}</strong>
          <span className="block text-sm text-muted-foreground">{ROLE_DESCRICOES[convite.role]}</span>
        </LinhaDaLegenda>
        {convite.role === "CAMPO" && (
          <LinhaDaLegenda rotulo="Obras">
            {descreverAcessoObras(convite.role, convite.todasObras, obras.map((o) => o.nome))}
          </LinhaDaLegenda>
        )}
        <LinhaDaLegenda rotulo="Válido até">
          <span className="num text-base">{formatarData(convite.expiraEm)}</span>
        </LinhaDaLegenda>
      </dl>

      <div className="mt-5 grid gap-5">
        {logado && (
          <AvisoDeAcesso tom="neutro" titulo={`Você está conectado como ${logado.nome}.`}>
            Ao concluir, você entra com a conta nova.
          </AvisoDeAcesso>
        )}
        <CadastroForm token={token} nome={convite.nome ?? ""} email={convite.email} />
      </div>
    </FolhaDeAcesso>
  );
}

/** Linha do selo do convite: rótulo à esquerda, valor à direita, separados por régua. */
function LinhaDaLegenda({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)]">
      <dt className="border-r border-foreground/40 px-3 py-3 text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="px-3 py-3">{children}</dd>
    </div>
  );
}
