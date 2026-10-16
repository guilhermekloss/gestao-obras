import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaFiltro } from "@/services/obras";
import { descreverAcessoObras, podeVerObra, restricaoDeObras, ROLE_LABELS } from "@/services/acesso";
import { serieSemanal, situacaoDeUso } from "@/services/atividade";
import { dataDoRdo } from "@/services/rdo";
import { formatarData, formatarDataCurta, formatarMoeda, formatarTempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { StatusBadge, type Estado } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { EditarUsuarioDialog } from "../usuario-dialogs";
import { encerrarSessoesUsuario } from "../actions";
import { FeedAtividades } from "../feed-atividades";
import { carregarPerfilUsuario, paraEdicao } from "../dados";
import { AlertTriangle, LogOut } from "lucide-react";
import { LinkVoltar } from "@/components/link-voltar";

export const metadata: Metadata = { title: "Usuário" };

const SEMANAS = 12;

const SITUACAO: Record<ReturnType<typeof situacaoDeUso>, { rotulo: string; estado: Estado }> = {
  em_uso: { rotulo: "Em uso", estado: "no-prazo" },
  nunca: { rotulo: "Nunca entrou", estado: "neutro" },
  parado: { rotulo: "Parado há 30+ dias", estado: "atencao" },
  inativo: { rotulo: "Desativado", estado: "neutro" },
};

export default async function UsuarioPerfilPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPapel("ADMIN");
  const { id } = await params;

  const [perfil, obras] = await Promise.all([carregarPerfilUsuario(id), listarObrasParaFiltro()]);
  if (!perfil) notFound();
  const { usuario, totais, porObra, feed } = perfil;

  const agora = new Date();
  const situacao = SITUACAO[situacaoDeUso(usuario, agora)];
  const restricao = restricaoDeObras(usuario);
  const nomesObras = usuario.obras.map((o) => o.obra.nome);
  const semAcessoHoje = porObra.filter((p) => !podeVerObra(restricao, p.obraId));

  const series = {
    lancamentos: serieSemanal(perfil.datas.lancamentos, SEMANAS, agora),
    rdos: serieSemanal(perfil.datas.rdos, SEMANAS, agora),
    avancos: serieSemanal(perfil.datas.avancos, SEMANAS, agora),
  };
  const semanas = series.rdos.map((s, i) => ({
    inicio: s.inicio,
    lancamentos: series.lancamentos[i].total,
    rdos: s.total,
    avancos: series.avancos[i].total,
  }));
  const maxSemana = Math.max(1, ...semanas.map((s) => s.lancamentos + s.rdos + s.avancos));
  const totalPeriodo = semanas.reduce((acc, s) => acc + s.lancamentos + s.rdos + s.avancos, 0);

  const colunasObras: ColunaDados<(typeof porObra)[number]>[] = [
    {
      id: "obra",
      titulo: "Obra",
      papel: "titulo",
      celula: (p) => (
        <span className="flex flex-wrap items-center gap-x-2">
          <Link href={`/obras/${p.obraId}`} className={`${LINK_DA_LINHA} font-medium`}>
            {p.nome}
          </Link>
          {!podeVerObra(restricao, p.obraId) && <StatusBadge estado="atencao">Sem acesso hoje</StatusBadge>}
        </span>
      ),
    },
    { id: "rdos", titulo: "RDOs", numerica: true, celula: (p) => p.rdos || null },
    { id: "avancos", titulo: "Avanços", numerica: true, celula: (p) => p.medicoes || null },
    { id: "lancamentos", titulo: "Lançamentos", numerica: true, celula: (p) => p.lancamentos || null },
    {
      id: "valor",
      titulo: "Valor lançado",
      papel: "valor",
      numerica: true,
      celula: (p) => (p.valorCents ? formatarMoeda(p.valorCents) : null),
    },
    {
      id: "ultimo",
      titulo: "Último registro",
      numerica: true,
      classe: "tabela:text-muted-foreground",
      celula: (p) => formatarTempoRelativo(p.ultimaEm, agora),
    },
  ];

  return (
    <div className="space-y-6">
      <LinkVoltar href="/usuarios">Usuários</LinkVoltar>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl md:text-3xl">{usuario.nome}</h1>
            <Badge variant="secondary">{ROLE_LABELS[usuario.role]}</Badge>
            <StatusBadge estado={situacao.estado}>{situacao.rotulo}</StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">{usuario.email}</p>
          <p className="text-xs text-muted-foreground">
            Conta criada em {formatarData(usuario.criadoEm)}
            {usuario.conviteAceito?.criadoPor && <> por convite de {usuario.conviteAceito.criadoPor.nome}</>}
            {" · "}
            {usuario.ultimoAcessoEm
              ? `último acesso ${formatarTempoRelativo(usuario.ultimoAcessoEm, agora)}`
              : "ainda não entrou"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            variant="outline"
            action={encerrarSessoesUsuario.bind(null, usuario.id)}
            mensagem={`Desconectar ${usuario.nome} de todos os aparelhos? A pessoa precisará entrar de novo com e-mail e senha.`}
          >
            <LogOut className="size-4" /> Encerrar sessões
          </ConfirmButton>
          <EditarUsuarioDialog usuario={paraEdicao(usuario)} obras={obras} comTexto />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          titulo="Lançamentos feitos"
          valor={String(totais.lancamentos)}
          detalhe={totais.lancamentos > 0 ? formatarMoeda(totais.valorLancadoCents) : undefined}
        />
        <Numero titulo="RDOs registrados" valor={String(totais.rdos)} detalhe={totais.fotos ? `${totais.fotos} fotos` : undefined} />
        <Numero titulo="Avanços físicos lançados" valor={String(totais.avancos)} />
        <Numero titulo="Ações nos últimos 30 dias" valor={String(totais.acoes30)} detalhe="registradas no log" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Produção nas últimas {SEMANAS} semanas</CardTitle>
            <CardDescription>
              {totalPeriodo === 0
                ? "Nenhum lançamento, RDO ou avanço no período."
                : `${totalPeriodo} ${totalPeriodo === 1 ? "registro" : "registros"} — lançamentos, RDOs e avanços criados por ${usuario.nome.split(" ")[0]}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Registros por semana">
              {semanas.map((s) => {
                const total = s.lancamentos + s.rdos + s.avancos;
                return (
                  <div
                    key={s.inicio.toISOString()}
                    className="flex h-full flex-1 flex-col justify-end"
                    title={`Semana de ${formatarDataCurta(s.inicio)}: ${s.lancamentos} lançamento(s), ${s.rdos} RDO(s), ${s.avancos} avanço(s)`}
                  >
                    <div className="flex flex-col overflow-hidden rounded-sm" style={{ height: `${(total / maxSemana) * 100}%` }}>
                      <div className="bg-estado-no-prazo-borda" style={{ flexGrow: s.lancamentos }} />
                      <div className="bg-estado-atencao-borda" style={{ flexGrow: s.rdos }} />
                      <div className="bg-estado-andamento-borda" style={{ flexGrow: s.avancos }} />
                    </div>
                    {total === 0 && <div className="h-0.5 rounded-sm bg-muted" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatarDataCurta(semanas[0].inicio)}</span>
              <span>esta semana</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Legenda cor="bg-estado-no-prazo-borda">Lançamentos</Legenda>
              <Legenda cor="bg-estado-atencao-borda">RDOs</Legenda>
              <Legenda cor="bg-estado-andamento-borda">Avanços</Legenda>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acesso</CardTitle>
            <CardDescription>O que {usuario.nome.split(" ")[0]} pode ver hoje.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Papel: </span>
              {ROLE_LABELS[usuario.role]}
            </p>
            <div>
              <p className="text-muted-foreground">Obras:</p>
              {restricao === null ? (
                <p>{descreverAcessoObras(usuario.role, usuario.todasObras, nomesObras)}</p>
              ) : nomesObras.length === 0 ? (
                <p className="text-estado-atencao-fg">Nenhuma obra liberada</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {usuario.obras.map((o) => (
                    <li key={o.obraId}>
                      <Badge variant="outline" render={<Link href={`/obras/${o.obraId}`} />}>
                        {o.obra.nome}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {semAcessoHoje.length > 0 && (
              <p className="flex gap-2 rounded-md bg-estado-atencao p-2 text-xs text-estado-atencao-fg">
                <AlertTriangle className="size-4 shrink-0" />
                Tem registros em {semAcessoHoje.map((p) => p.nome).join(", ")}, mas não tem mais acesso a{" "}
                {semAcessoHoje.length === 1 ? "essa obra" : "essas obras"}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atuação por obra</CardTitle>
          <CardDescription>Onde {usuario.nome.split(" ")[0]} trabalhou, a partir dos registros que criou.</CardDescription>
        </CardHeader>
        <CardContent>
          {porObra.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro em obras ainda.</p>
          ) : (
            <ListaDeDados
              legenda="Atuação por obra"
              linhas={porObra}
              chave={(p) => p.obraId}
              colunas={colunasObras}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimos lançamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {perfil.ultimosLancamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lançamento feito.</p>
            ) : (
              <ul className="divide-y text-sm">
                {perfil.ultimosLancamentos.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notas/${n.id}`} className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50">
                      <span className="flex-1 truncate">
                        {n.tipoDocumento === "NF" ? "NF" : n.tipoDocumento.toLowerCase()} {n.numero} · {n.fornecedor.nome}
                      </span>
                      <span className="font-medium">{formatarMoeda(n.totalCents)}</span>
                      <span className="w-14 text-right text-xs text-muted-foreground">{formatarDataCurta(n.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimos RDOs</CardTitle>
          </CardHeader>
          <CardContent>
            {perfil.ultimosRdos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum RDO registrado.</p>
            ) : (
              <ul className="divide-y text-sm">
                {perfil.ultimosRdos.map((r) => (
                  <li key={r.id}>
                    <Link href={`/diario/${r.id}`} className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50">
                      <span className="flex-1 truncate">
                        {formatarData(dataDoRdo(r.data))} · {r.obraNome}
                      </span>
                      {r._count.fotos > 0 && (
                        <span className="text-xs text-muted-foreground">{r._count.fotos} foto(s)</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Histórico de ações</CardTitle>
            <CardDescription>Tudo o que {usuario.nome.split(" ")[0]} criou, alterou ou excluiu.</CardDescription>
          </div>
          {feed.total > feed.atividades.length && (
            <Button variant="outline" size="sm" render={<Link href={`/usuarios?aba=atividade&usuario=${usuario.id}`} />}>
              Ver todas ({feed.total})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <FeedAtividades atividades={feed.atividades} mostrarUsuario={false} vazio="Ainda não fez nenhuma ação na plataforma." />
        </CardContent>
      </Card>
    </div>
  );
}

function Numero({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-2xl num">{valor}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

function Legenda({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", cor)} />
      {children}
    </span>
  );
}
