import type { Metadata } from "next";
import Link from "next/link";
import type { ManifestacaoSefaz, SituacaoDocumentoSefaz, StatusDocumentoSefaz, StatusExecucaoSefaz } from "@prisma/client";
import { Ban, FileSearch, RotateCcw, ShieldCheck } from "lucide-react";
import { exigirPapel } from "@/lib/auth";
import { formatarData, formatarMoeda, formatarTempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AbasDaPagina } from "@/components/abas-da-pagina";
import { ConfirmButton } from "@/components/confirm-button";
import { EstadoVazio } from "@/components/estado-vazio";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { SelectNativo } from "@/components/select-nativo";
import { StatusBadge, type Estado } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDocumento } from "@/services/nfe-xml";
import {
  DIAS_AVISO_CERTIFICADO,
  MANIFESTACAO_LABELS,
  POR_PAGINA,
  SITUACAO_LABELS,
  STATUS_DOC_LABELS,
  STATUS_EXECUCAO_LABELS,
  carregarPainel,
  listarDocumentos,
  listarExecucoes,
  type EstadoCursor,
  type FiltroDocumentos,
} from "@/services/sefaz/painel";
import { FREQUENCIA_LABELS, consultaProgramadaDevida, proximoHorarioProgramado } from "@/services/sefaz/regras";
import { BotaoConsultarAgora, BotaoReenviarCiencia } from "./acoes";
import { descartarDocumento, restaurarDocumento } from "./actions";

export const metadata: Metadata = { title: "Captura Sefaz" };

const ABAS = [
  { key: "visao", label: "Visão geral" },
  { key: "execucoes", label: "Execuções" },
  { key: "documentos", label: "Documentos" },
] as const;

type Busca = { aba?: string; pagina?: string; situacao?: string; manifestacao?: string; status?: string };

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmt = (d: Date | null | undefined) => (d ? dataHora.format(d) : "—");

const ESTADO_CURSOR: Record<EstadoCursor, { estado: Estado; rotulo: string }> = {
  ATIVO: { estado: "no-prazo", rotulo: "Pronto para consultar" },
  AGUARDANDO: { estado: "andamento", rotulo: "Em dia, aguardando janela" },
  BLOQUEADO: { estado: "vencido", rotulo: "Bloqueado pela Sefaz" },
  ERRO: { estado: "atrasado", rotulo: "Última consulta com erro" },
  NUNCA: { estado: "neutro", rotulo: "Ainda não consultado" },
};

const ESTADO_EXECUCAO: Record<StatusExecucaoSefaz, Estado> = {
  SUCESSO: "pago",
  SEM_NOVIDADES: "no-prazo",
  PULADA: "neutro",
  ERRO: "atrasado",
  BLOQUEADA: "vencido",
};

const ESTADO_MANIFESTACAO: Record<ManifestacaoSefaz, Estado> = {
  PENDENTE: "andamento",
  CIENCIA_ENVIADA: "no-prazo",
  ERRO: "atrasado",
  DISPENSADA: "neutro",
};

const ESTADO_STATUS_DOC: Record<StatusDocumentoSefaz, Estado> = { NOVA: "atencao", LANCADA: "pago", DESCARTADA: "neutro" };

function valorDe<T extends string>(opcoes: Record<T, string>, v: string | undefined): T | undefined {
  return v && v in opcoes ? (v as T) : undefined;
}

export default async function SefazPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPapel("ADMIN");
  const busca = await searchParams;
  const aba = ABAS.find((a) => a.key === busca.aba) ?? ABAS[0];
  const pagina = Math.max(1, Number(busca.pagina) || 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl">Captura de NF-e na Sefaz</h1>
          <p className="text-sm text-muted-foreground">
            NF-e emitidas contra o CNPJ da empresa, buscadas no Ambiente Nacional uma ou duas vezes ao dia.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/notas/recebidas" />}>
          <FileSearch className="size-4" /> NF-e recebidas
        </Button>
      </div>

      <AbasDaPagina
        rotulo="Seções da captura"
        ativa={aba.key}
        abas={ABAS.map((a) => ({ key: a.key, label: a.label, href: a.key === "visao" ? "/sefaz" : `/sefaz?aba=${a.key}` }))}
      />

      {aba.key === "visao" && <AbaVisao />}
      {aba.key === "execucoes" && <AbaExecucoes pagina={pagina} />}
      {aba.key === "documentos" && (
        <AbaDocumentos
          pagina={pagina}
          filtro={{
            situacao: valorDe<SituacaoDocumentoSefaz>(SITUACAO_LABELS, busca.situacao),
            manifestacao: valorDe<ManifestacaoSefaz>(MANIFESTACAO_LABELS, busca.manifestacao),
            status: valorDe<StatusDocumentoSefaz>(STATUS_DOC_LABELS, busca.status),
          }}
        />
      )}
    </div>
  );
}

function Indicador({ titulo, valor, detalhe, href, alerta }: { titulo: string; valor: number | string; detalhe?: string; href?: string; alerta?: boolean }) {
  const conteudo = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/50")}>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("text-2xl num", alerta && "text-estado-atencao-fg")}>{valor}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{conteudo}</Link> : conteudo;
}

async function AbaVisao() {
  const agora = new Date();
  const p = await carregarPainel(agora);
  const { config } = p;
  const diasCert = config.certificado ? Math.ceil((config.certificado.validoAte.getTime() - agora.getTime()) / 86_400_000) : null;

  return (
    <div className="space-y-6">
      {!config.habilitado && (
        <div role="status" className="rounded-xl border-2 border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg">
          <span className="font-bold">Captura desligada.</span> Cadastre a empresa e o certificado A1 e ligue a captura
          em{" "}
          <Link href="/empresa" className="font-medium underline">
            Empresa
          </Link>
          . Até lá nada é consultado.
        </div>
      )}

      <div id="sefaz-indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="NF-e a lançar" valor={p.aLancar} href="/notas/recebidas" alerta={p.aLancar > 0} detalhe="com XML completo" />
        <Indicador titulo="Aguardando XML" valor={p.aguardandoXml} detalhe="Ciência feita ou pendente" />
        <Indicador titulo="Recebidas" valor={p.docs24h} detalhe={`24 h · ${p.docs7d} em 7 dias`} />
        <Indicador
          titulo="Ciências com erro"
          valor={p.cienciasComErro}
          alerta={p.cienciasComErro > 0}
          href={p.cienciasComErro > 0 ? "/sefaz?aba=documentos&manifestacao=ERRO" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card id="sefaz-cnpjs">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>CNPJs consultados</CardTitle>
            <BotaoConsultarAgora desabilitado={!config.habilitado || p.cnpjs.length === 0} />
          </CardHeader>
          <CardContent className="space-y-3">
            {p.cnpjs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum CNPJ cadastrado.{" "}
                <Link href="/empresa" className="font-medium underline">
                  Cadastre a empresa
                </Link>{" "}
                com o CNPJ da mesma raiz do certificado.
              </p>
            ) : (
              p.cnpjs.map((c) => {
                const { estado, rotulo } = ESTADO_CURSOR[c.estado];
                return (
                  <div key={c.cnpj} className="space-y-2 rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium num">{formatarDocumento(c.cnpj)}</span>
                      <StatusBadge estado={estado}>{rotulo}</StatusBadge>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-muted-foreground">Última consulta</dt>
                        <dd>{c.cursor?.ultimaConsultaEm ? formatarTempoRelativo(c.cursor.ultimaConsultaEm, agora) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Próxima consulta automática</dt>
                        <dd>
                          {c.cursor?.bloqueadoAte && c.cursor.bloqueadoAte > agora
                            ? `bloqueada até ${fmt(c.cursor.bloqueadoAte)}`
                            : consultaProgramadaDevida(config.frequencia, c.cursor?.ultimaConsultaEm ?? null, agora)
                              ? "na próxima abertura do sistema"
                              : fmt(proximoHorarioProgramado(config.frequencia, agora))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">NSU atual / máximo</dt>
                        <dd className="num">
                          {Number(c.cursor?.ultNsu ?? 0)} / {Number(c.cursor?.maxNsu ?? 0)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Último retorno</dt>
                        <dd className="truncate" title={c.cursor?.ultimoMotivo ?? undefined}>
                          {c.cursor?.ultimoCStat ? `${c.cursor.ultimoCStat} · ${c.cursor.ultimoMotivo ?? ""}` : "—"}
                        </dd>
                      </div>
                    </dl>
                    {c.ultimaExecucao?.status === "ERRO" && c.ultimaExecucao.mensagem && (
                      <p className="text-sm text-estado-atrasado-fg">{c.ultimaExecucao.mensagem}</p>
                    )}
                    {c.errosSeguidos > 1 && (
                      <p className="text-sm text-estado-atrasado-fg">{c.errosSeguidos} execuções seguidas com erro.</p>
                    )}
                  </div>
                );
              })
            )}
            {config.foraDoCertificado.length > 0 && (
              <p className="text-sm text-estado-atencao-fg">
                Fora do certificado (não consultados): {config.foraDoCertificado.map(formatarDocumento).join(", ")}. A Sefaz
                só aceita CNPJs da mesma raiz do certificado A1.
              </p>
            )}
          </CardContent>
        </Card>

        <Card id="sefaz-certificado">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Certificado A1
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {config.certificado ? (
              <>
                <p className="font-medium break-words">{config.certificado.titular}</p>
                <p className="text-muted-foreground">
                  CNPJ {config.certificado.cnpj ? formatarDocumento(config.certificado.cnpj) : "não identificado"}
                </p>
                <p className="text-muted-foreground break-words">Emitido por {config.certificado.emissor}</p>
                <p>
                  Válido até <span className="font-medium">{formatarData(config.certificado.validoAte)}</span>
                </p>
                {diasCert !== null && diasCert <= 0 ? (
                  <StatusBadge estado="vencido">Vencido</StatusBadge>
                ) : diasCert !== null && diasCert <= DIAS_AVISO_CERTIFICADO ? (
                  <StatusBadge estado="atencao">Vence em {diasCert} dia(s)</StatusBadge>
                ) : (
                  <StatusBadge estado="no-prazo">Em dia</StatusBadge>
                )}
              </>
            ) : (
              <p className="text-estado-atrasado-fg">{config.erroCertificado}</p>
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Ambiente: <Badge variant="secondary">{config.ambiente === "producao" ? "Produção" : "Homologação"}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">Frequência: {FREQUENCIA_LABELS[config.frequencia]}</p>
            <Button variant="outline" size="sm" render={<Link href="/empresa" />}>
              {config.certificado ? "Trocar certificado" : "Enviar certificado"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Regras da Sefaz respeitadas automaticamente: a consulta segue a sequência de NSU, espera 1 h quando a fila
        acaba e para por 1 h se a Sefaz acusar consumo indevido (656). NFC-e (modelo 65) não é distribuída pela
        Sefaz e continua entrando pela importação de XML ou foto.
      </p>
    </div>
  );
}

function Paginacao({ pagina, total, href }: { pagina: number; total: number; href: (p: number) => string }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total} registros · página {pagina} de {paginas}
      </span>
      <div className="flex gap-2">
        {pagina > 1 && (
          <Button variant="outline" size="sm" render={<Link href={href(pagina - 1)} />}>
            Anterior
          </Button>
        )}
        {pagina < paginas && (
          <Button variant="outline" size="sm" render={<Link href={href(pagina + 1)} />}>
            Próxima
          </Button>
        )}
      </div>
    </div>
  );
}

async function AbaExecucoes({ pagina }: { pagina: number }) {
  const { execucoes, total } = await listarExecucoes(pagina);
  type Execucao = (typeof execucoes)[number];
  const colunas: ColunaDados<Execucao>[] = [
    { id: "quando", titulo: "Quando", papel: "titulo", celula: (e) => fmt(e.iniciadaEm) },
    {
      id: "status",
      titulo: "Resultado",
      papel: "estado",
      celula: (e) => <StatusBadge estado={ESTADO_EXECUCAO[e.status]}>{STATUS_EXECUCAO_LABELS[e.status]}</StatusBadge>,
    },
    { id: "origem", titulo: "Origem", celula: (e) => (e.origem === "MANUAL" ? "Manual" : "Agendada") },
    { id: "cnpj", titulo: "CNPJ", semCartao: true, classe: "num", celula: (e) => formatarDocumento(e.cnpj) },
    { id: "docs", titulo: "NF-e novas", numerica: true, papel: "valor", celula: (e) => e.docsRecebidos },
    { id: "ciencias", titulo: "Ciências", numerica: true, celula: (e) => e.ciencias },
    { id: "nsu", titulo: "NSU", classe: "num text-xs", celula: (e) => (e.nsuInicial ? `${Number(e.nsuInicial)} → ${Number(e.nsuFinal ?? e.nsuInicial)}` : "—") },
    {
      id: "retorno",
      titulo: "Retorno da Sefaz",
      classe: "text-sm",
      celula: (e) => (
        <span className="block min-w-56 max-w-md whitespace-normal break-words">
          {e.cStat && <span className="font-medium">{e.cStat} · </span>}
          {e.mensagem || "—"}
        </span>
      ),
    },
    { id: "duracao", titulo: "Duração", semCartao: true, numerica: true, celula: (e) => (e.duracaoMs != null ? `${(e.duracaoMs / 1000).toFixed(1)} s` : "—") },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Consultas agendadas que caem dentro da janela de espera não aparecem aqui; as manuais aparecem sempre.
      </p>
      <ListaDeDados legenda="Execuções da captura" linhas={execucoes} chave={(e) => e.id} colunas={colunas} vazio="Nenhuma consulta feita ainda." />
      <Paginacao pagina={pagina} total={total} href={(p) => `/sefaz?aba=execucoes&pagina=${p}`} />
    </div>
  );
}

function Filtro<T extends string>({ rotulo, nome, valor, opcoes }: { rotulo: string; nome: string; valor?: T; opcoes: Record<T, string> }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={`filtro-${nome}`} className="text-xs text-muted-foreground">
        {rotulo}
      </label>
      <SelectNativo id={`filtro-${nome}`} name={nome} defaultValue={valor ?? ""} className="w-44">
        <option value="">Todos</option>
        {(Object.keys(opcoes) as T[]).map((k) => (
          <option key={k} value={k}>
            {opcoes[k]}
          </option>
        ))}
      </SelectNativo>
    </div>
  );
}

async function AbaDocumentos({ pagina, filtro }: { pagina: number; filtro: FiltroDocumentos }) {
  const { documentos, total } = await listarDocumentos(filtro, pagina);
  type Documento = (typeof documentos)[number];
  const colunas: ColunaDados<Documento>[] = [
    {
      id: "emitente",
      titulo: "Emitente",
      papel: "titulo",
      celula: (d) => (
        <>
          <span className="font-medium">{d.emitenteNome}</span>
          <span className="block text-xs text-muted-foreground num">{formatarDocumento(d.emitenteDoc)}</span>
        </>
      ),
    },
    { id: "valor", titulo: "Valor", papel: "valor", numerica: true, celula: (d) => formatarMoeda(d.valorCents) },
    {
      id: "situacao",
      titulo: "Situação",
      papel: "estado",
      celula: (d) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge estado={ESTADO_STATUS_DOC[d.status]}>{STATUS_DOC_LABELS[d.status]}</StatusBadge>
          <Badge variant="secondary">{SITUACAO_LABELS[d.situacao]}</Badge>
        </div>
      ),
    },
    {
      id: "nota",
      titulo: "NF / emissão",
      celula: (d) => (
        <>
          {d.numero} / {d.serie}
          <span className="block text-xs text-muted-foreground">{formatarData(d.dataEmissao)}</span>
        </>
      ),
    },
    {
      id: "manifestacao",
      titulo: "Manifestação",
      celula: (d) => (
        <>
          <StatusBadge estado={ESTADO_MANIFESTACAO[d.manifestacao]}>{MANIFESTACAO_LABELS[d.manifestacao]}</StatusBadge>
          {d.manifestacaoErro && (
            <span className="block min-w-40 max-w-52 whitespace-normal break-words text-xs text-estado-atrasado-fg">{d.manifestacaoErro}</span>
          )}
        </>
      ),
    },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      celula: (d) => (
        <div className="flex flex-col items-end gap-1">
          {d.notaFiscalId && (
            <Button variant="ghost" size="sm" render={<Link href={`/notas/${d.notaFiscalId}`} />}>
              Ver lançamento
            </Button>
          )}
          {d.situacao === "RESUMO" && (d.manifestacao === "ERRO" || d.manifestacao === "PENDENTE") && <BotaoReenviarCiencia id={d.id} />}
          {d.status === "NOVA" && (
            <ConfirmButton action={descartarDocumento.bind(null, d.id)} mensagem="Descartar esta NF-e? Ela sai da caixa de recebidas (dá para restaurar aqui)." variant="ghost">
              <Ban className="size-4" /> Descartar
            </ConfirmButton>
          )}
          {d.status === "DESCARTADA" && (
            <ConfirmButton action={restaurarDocumento.bind(null, d.id)} mensagem="Devolver esta NF-e para a caixa de recebidas?" variant="ghost">
              <RotateCcw className="size-4" /> Restaurar
            </ConfirmButton>
          )}
        </div>
      ),
    },
  ];

  const params = (p: number) =>
    new URLSearchParams({
      aba: "documentos",
      ...(filtro.situacao ? { situacao: filtro.situacao } : {}),
      ...(filtro.manifestacao ? { manifestacao: filtro.manifestacao } : {}),
      ...(filtro.status ? { status: filtro.status } : {}),
      pagina: String(p),
    }).toString();

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="documentos" />
        <Filtro rotulo="Situação" nome="situacao" valor={filtro.situacao} opcoes={SITUACAO_LABELS} />
        <Filtro rotulo="Manifestação" nome="manifestacao" valor={filtro.manifestacao} opcoes={MANIFESTACAO_LABELS} />
        <Filtro rotulo="Lançamento" nome="status" valor={filtro.status} opcoes={STATUS_DOC_LABELS} />
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {(filtro.situacao || filtro.manifestacao || filtro.status) && (
          <Button variant="ghost" render={<Link href="/sefaz?aba=documentos" />}>
            Limpar
          </Button>
        )}
      </form>
      {total === 0 && !filtro.situacao && !filtro.manifestacao && !filtro.status ? (
        <EstadoVazio icone={FileSearch} titulo="Nenhuma NF-e recebida ainda">
          Assim que a Sefaz devolver notas emitidas contra o CNPJ da empresa, elas aparecem aqui.
        </EstadoVazio>
      ) : (
        <ListaDeDados legenda="NF-e recebidas da Sefaz" linhas={documentos} chave={(d) => d.id} colunas={colunas} vazio="Nada bate com estes filtros." />
      )}
      <Paginacao pagina={pagina} total={total} href={(p) => `/sefaz?${params(p)}`} />
    </div>
  );
}
