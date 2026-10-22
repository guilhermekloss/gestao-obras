import type { Metadata } from "next";
import Link from "next/link";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaFiltro } from "@/services/obras";
import { descreverAcessoObras, ROLE_LABELS } from "@/services/acesso";
import { CATEGORIA_LABELS, situacaoDeUso, type CategoriaAtividade } from "@/services/atividade";
import { STATUS_CONVITE_LABELS, type StatusConvite } from "@/services/convite";
import { formatarData, formatarTempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AbasDaPagina } from "@/components/abas-da-pagina";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { StatusBadge, type Estado } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectNativo } from "@/components/select-nativo";
import { NovoUsuarioDialog, EditarUsuarioDialog } from "./usuario-dialogs";
import { AcoesConvite, NovoConviteDialog } from "./convite-dialogs";
import { FeedAtividades } from "./feed-atividades";
import { EstadoVazio } from "@/components/estado-vazio";
import { MailPlus, ShieldCheck } from "lucide-react";
import { MAX_FALHAS_EMAIL, REGRA_LOGIN, type SituacaoBloqueio } from "@/services/protecao-login";
import { LiberarBloqueio } from "./acoes-bloqueio";
import {
  ATIVIDADES_POR_PAGINA,
  carregarBloqueios,
  carregarConvites,
  contarBloqueiosAtivos,
  carregarListaUsuarios,
  listarAtividades,
  paraEdicao,
  type UsuarioDaLista,
} from "./dados";

export const metadata: Metadata = { title: "Usuários" };

const ABAS = [
  { key: "pessoas", label: "Pessoas" },
  { key: "convites", label: "Convites" },
  { key: "atividade", label: "Atividade" },
  { key: "bloqueios", label: "Bloqueios" },
] as const;

type Busca = { aba?: string; usuario?: string; obra?: string; categoria?: string; pagina?: string };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPapel("ADMIN");
  const busca = await searchParams;
  const aba = ABAS.find((a) => a.key === busca.aba) ?? ABAS[0];

  const [{ usuarios, convitesPendentes }, obras, bloqueiosAtivos] = await Promise.all([
    carregarListaUsuarios(),
    listarObrasParaFiltro(),
    contarBloqueiosAtivos(),
  ]);

  const agora = new Date();
  const ativos = usuarios.filter((u) => u.ativo);
  const usaram7d = ativos.filter(
    (u) => u.ultimoAcessoEm && agora.getTime() - u.ultimoAcessoEm.getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const parados = ativos.filter((u) => ["nunca", "parado"].includes(situacaoDeUso(u, agora))).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl">Usuários e acessos</h1>
          <p className="text-sm text-muted-foreground">Quem acessa a plataforma, o que pode ver e o que tem feito.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NovoUsuarioDialog obras={obras} />
          <NovoConviteDialog obras={obras} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Usuários ativos" valor={ativos.length} detalhe={usuarios.length > ativos.length ? `${usuarios.length - ativos.length} desativado(s)` : undefined} />
        <Indicador titulo="Entraram nos últimos 7 dias" valor={usaram7d} detalhe={`de ${ativos.length} ativos`} />
        <Indicador
          titulo="Convites aguardando cadastro"
          valor={convitesPendentes}
          href="/usuarios?aba=convites"
        />
        <Indicador
          titulo="Contas paradas"
          valor={parados}
          detalhe="nunca entraram ou 30+ dias sem entrar"
          alerta={parados > 0}
        />
      </div>

      <AbasDaPagina
        rotulo="Seções de usuários"
        ativa={aba.key}
        abas={ABAS.map((a) => ({
          key: a.key,
          label: a.label,
          href: a.key === "pessoas" ? "/usuarios" : `/usuarios?aba=${a.key}`,
          extra:
            a.key === "convites" && convitesPendentes > 0 ? (
              <Badge variant="secondary" className="ml-1.5">
                {convitesPendentes}
              </Badge>
            ) : a.key === "bloqueios" && bloqueiosAtivos > 0 ? (
              <Badge variant="destructive" className="ml-1.5">
                {bloqueiosAtivos}
              </Badge>
            ) : undefined,
        }))}
      />

      {aba.key === "pessoas" && <AbaPessoas usuarios={usuarios} obras={obras} agora={agora} />}
      {aba.key === "convites" && <AbaConvites obras={obras} />}
      {aba.key === "atividade" && <AbaAtividade busca={busca} usuarios={usuarios} obras={obras} />}
      {aba.key === "bloqueios" && <AbaBloqueios />}
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  detalhe,
  href,
  alerta = false,
}: {
  titulo: string;
  valor: number;
  detalhe?: string;
  href?: string;
  alerta?: boolean;
}) {
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

function UltimoAcesso({ u, agora }: { u: UsuarioDaLista; agora: Date }) {
  const situacao = situacaoDeUso(u, agora);
  if (situacao === "nunca") return <StatusBadge estado="neutro">Nunca entrou</StatusBadge>;
  if (!u.ultimoAcessoEm) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(situacao === "parado" && "text-estado-atencao-fg")}
      title={formatarData(u.ultimoAcessoEm)}
    >
      {formatarTempoRelativo(u.ultimoAcessoEm, agora)}
    </span>
  );
}

function ResumoProducao({ u }: { u: UsuarioDaLista }) {
  const partes = [
    u.ultimos30.lancamentos && `${u.ultimos30.lancamentos} lançamento${u.ultimos30.lancamentos === 1 ? "" : "s"}`,
    u.ultimos30.rdos && `${u.ultimos30.rdos} RDO${u.ultimos30.rdos === 1 ? "" : "s"}`,
    u.ultimos30.avancos && `${u.ultimos30.avancos} avanço${u.ultimos30.avancos === 1 ? "" : "s"}`,
  ].filter(Boolean);
  if (partes.length === 0 && u.ultimos30.acoes === 0) return <span className="text-muted-foreground">Sem registros</span>;
  return (
    <span>
      {partes.join(" · ")}
      {u.ultimos30.acoes > 0 && (
        <span className="block text-xs text-muted-foreground">{u.ultimos30.acoes} ações no log</span>
      )}
    </span>
  );
}

function AbaPessoas({
  usuarios,
  obras,
  agora,
}: {
  usuarios: UsuarioDaLista[];
  obras: { id: string; nome: string }[];
  agora: Date;
}) {
  const colunas: ColunaDados<UsuarioDaLista>[] = [
    {
      id: "usuario",
      titulo: "Usuário",
      papel: "titulo",
      celula: (u) => (
        <>
          <Link href={`/usuarios/${u.id}`} className={`${LINK_DA_LINHA} font-medium`}>
            {u.nome}
          </Link>
          <span className="block text-xs text-muted-foreground">{u.email}</span>
        </>
      ),
    },
    {
      id: "papel",
      titulo: "Papel",
      papel: "estado",
      celula: (u) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
          {!u.ativo && <StatusBadge estado="neutro">Desativado</StatusBadge>}
        </div>
      ),
    },
    {
      id: "obras",
      titulo: "Obras",
      classe: "text-sm",
      celula: (u) => descreverAcessoObras(u.role, u.todasObras, u.nomesObras),
    },
    {
      id: "acesso",
      titulo: "Último acesso",
      classe: "text-sm",
      celula: (u) => <UltimoAcesso u={u} agora={agora} />,
    },
    {
      id: "producao",
      titulo: "Últimos 30 dias",
      classe: "text-sm",
      celula: (u) => <ResumoProducao u={u} />,
    },
    {
      id: "editar",
      titulo: "Editar",
      papel: "acao",
      tituloOculto: true,
      classeCabecalho: "w-12",
      celula: (u) => <EditarUsuarioDialog usuario={paraEdicao(u)} obras={obras} />,
    },
  ];

  return (
    <ListaDeDados
      legenda="Pessoas com acesso"
      linhas={usuarios}
      chave={(u) => u.id}
      colunas={colunas}
      classeDaLinha={(u) => (u.ativo ? undefined : "opacity-60")}
    />
  );
}

const ESTADO_CONVITE: Record<StatusConvite, Estado> = {
  PENDENTE: "neutro",
  ACEITO: "pago",
  EXPIRADO: "atrasado",
  REVOGADO: "neutro",
};

async function AbaConvites({ obras }: { obras: { id: string; nome: string }[] }) {
  const convites = await carregarConvites();
  if (convites.length === 0) {
    return (
      <EstadoVazio
        icone={MailPlus}
        titulo="Nenhum convite enviado"
        acao={<NovoConviteDialog obras={obras} grande />}
      >
        Gere um link e a pessoa faz o próprio cadastro, já com o papel e as obras que você escolher.
      </EstadoVazio>
    );
  }
  const colunas: ColunaDados<(typeof convites)[number]>[] = [
    {
      id: "convidado",
      titulo: "Convidado",
      papel: "titulo",
      celula: (c) => (
        <>
          {c.usuario ? (
            <Link href={`/usuarios/${c.usuario.id}`} className={`${LINK_DA_LINHA} font-medium`}>
              {c.usuario.nome}
            </Link>
          ) : (
            <span className="font-medium">{c.nome ?? c.email ?? "Qualquer pessoa com o link"}</span>
          )}
          {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
        </>
      ),
    },
    {
      id: "papel",
      titulo: "Papel e obras",
      classe: "text-sm",
      celula: (c) => (
        <>
          <Badge variant="secondary">{ROLE_LABELS[c.role]}</Badge>
          <span className="block text-xs text-muted-foreground">
            {descreverAcessoObras(c.role, c.todasObras, c.nomesObras)}
          </span>
        </>
      ),
    },
    {
      id: "situacao",
      titulo: "Situação",
      papel: "estado",
      classe: "text-sm",
      celula: (c) => (
        <>
          <StatusBadge estado={ESTADO_CONVITE[c.status]}>{STATUS_CONVITE_LABELS[c.status]}</StatusBadge>
          <span className="block text-xs text-muted-foreground">
            {c.status === "ACEITO" && c.usadoEm
              ? `em ${formatarData(c.usadoEm)}`
              : c.status === "PENDENTE"
                ? `vale até ${formatarData(c.expiraEm)}`
                : c.status === "EXPIRADO"
                  ? `expirou em ${formatarData(c.expiraEm)}`
                  : ""}
          </span>
        </>
      ),
    },
    {
      id: "criadoPor",
      titulo: "Criado por",
      classe: "text-sm",
      celula: (c) => (
        <>
          {c.criadoPor?.nome ?? "—"}
          <span className="block text-xs text-muted-foreground">{formatarData(c.criadoEm)}</span>
        </>
      ),
    },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      celula: (c) =>
        c.status !== "ACEITO" ? <AcoesConvite id={c.id} podeCancelar={c.status === "PENDENTE"} /> : null,
    },
  ];

  return (
    <ListaDeDados
      legenda="Convites"
      linhas={convites}
      chave={(c) => c.id}
      colunas={colunas}
    />
  );
}

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const ESTADO_BLOQUEIO: Record<SituacaoBloqueio, { estado: Estado; rotulo: string }> = {
  ativo: { estado: "atrasado", rotulo: "Bloqueado" },
  expirado: { estado: "neutro", rotulo: "Terminou" },
  liberado: { estado: "pago", rotulo: "Liberado" },
};

async function AbaBloqueios() {
  const bloqueios = await carregarBloqueios();
  if (bloqueios.length === 0) {
    return (
      <EstadoVazio icone={ShieldCheck} titulo="Nenhum bloqueio nos últimos 7 dias">
        Quem erra a senha {MAX_FALHAS_EMAIL} vezes seguidas, ou um IP com muitas falhas, fica bloqueado por um tempo. Os bloqueios aparecem aqui e
        podem ser liberados antes do prazo.
      </EstadoVazio>
    );
  }
  const colunas: ColunaDados<(typeof bloqueios)[number]>[] = [
    {
      id: "origem",
      titulo: "Bloqueado",
      papel: "titulo",
      celula: (b) => (
        <>
          {b.usuario ? (
            <Link href={`/usuarios/${b.usuario.id}`} className={`${LINK_DA_LINHA} font-medium`}>
              {b.usuario.nome}
            </Link>
          ) : (
            <span className="font-medium break-all">{b.chave}</span>
          )}
          <span className="block text-xs text-muted-foreground break-all">
            {b.regra === REGRA_LOGIN.email ? (b.usuario ? b.chave : "e-mail sem cadastro") : "endereço IP"}
          </span>
        </>
      ),
    },
    {
      id: "motivo",
      titulo: "Motivo",
      classe: "text-sm",
      celula: (b) => (
        <>
          {b.motivo}
          <span className="block text-xs text-muted-foreground">em {dataHora.format(b.criadoEm)}</span>
        </>
      ),
    },
    {
      id: "situacao",
      titulo: "Situação",
      papel: "estado",
      classe: "text-sm",
      celula: (b) => (
        <>
          <StatusBadge estado={ESTADO_BLOQUEIO[b.situacao].estado}>{ESTADO_BLOQUEIO[b.situacao].rotulo}</StatusBadge>
          <span className="block text-xs text-muted-foreground">
            {b.situacao === "liberado" && b.liberadoEm
              ? `por ${b.liberadoPor?.nome ?? "—"} em ${dataHora.format(b.liberadoEm)}`
              : b.situacao === "ativo"
                ? `até ${dataHora.format(b.ate)}`
                : `em ${dataHora.format(b.ate)}`}
          </span>
        </>
      ),
    },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      celula: (b) => (b.situacao === "ativo" ? <LiberarBloqueio id={b.id} origem={b.usuario?.nome ?? b.chave} /> : null),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Bloqueios ativos e os dos últimos 7 dias. Quem reincide fica bloqueado por mais tempo: o e-mail até 1 hora, o IP até 24 horas.
      </p>
      <ListaDeDados legenda="Bloqueios por tentativas de login" linhas={bloqueios} chave={(b) => b.id} colunas={colunas} />
    </div>
  );
}

async function AbaAtividade({
  busca,
  usuarios,
  obras,
}: {
  busca: Busca;
  usuarios: UsuarioDaLista[];
  obras: { id: string; nome: string }[];
}) {
  const categoria = (Object.keys(CATEGORIA_LABELS) as CategoriaAtividade[]).find((c) => c === busca.categoria);
  const pagina = Math.max(1, Number(busca.pagina) || 1);
  const filtro = { usuarioId: busca.usuario || undefined, obraId: busca.obra || undefined, categoria };
  const { atividades, total } = await listarAtividades(filtro, pagina);
  const paginas = Math.max(1, Math.ceil(total / ATIVIDADES_POR_PAGINA));

  const params = (p: number) =>
    new URLSearchParams({
      aba: "atividade",
      ...(filtro.usuarioId ? { usuario: filtro.usuarioId } : {}),
      ...(filtro.obraId ? { obra: filtro.obraId } : {}),
      ...(categoria ? { categoria } : {}),
      pagina: String(p),
    }).toString();

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="atividade" />
        <Filtro rotulo="Usuário" nome="usuario" valor={filtro.usuarioId} opcoes={usuarios.map((u) => ({ id: u.id, nome: u.nome }))} />
        <Filtro rotulo="Obra" nome="obra" valor={filtro.obraId} opcoes={obras} />
        <Filtro
          rotulo="Tipo"
          nome="categoria"
          valor={categoria}
          opcoes={(Object.keys(CATEGORIA_LABELS) as CategoriaAtividade[]).map((c) => ({ id: c, nome: CATEGORIA_LABELS[c] }))}
        />
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {(filtro.usuarioId || filtro.obraId || categoria) && (
          <Button variant="ghost" render={<Link href="/usuarios?aba=atividade" />}>
            Limpar
          </Button>
        )}
      </form>

      <Card>
        <CardContent className="pt-2">
          <FeedAtividades
            atividades={atividades}
            vazio="Nada bate com estes filtros. O registro só começa a contar a partir desta versão."
          />
        </CardContent>
      </Card>

      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} ações · página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Button variant="outline" size="sm" render={<Link href={`/usuarios?${params(pagina - 1)}`} />}>
                Anteriores
              </Button>
            )}
            {pagina < paginas && (
              <Button variant="outline" size="sm" render={<Link href={`/usuarios?${params(pagina + 1)}`} />}>
                Mais antigas
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Filtro({
  rotulo,
  nome,
  valor,
  opcoes,
}: {
  rotulo: string;
  nome: string;
  valor?: string;
  opcoes: { id: string; nome: string }[];
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={`filtro-${nome}`} className="text-xs text-muted-foreground">
        {rotulo}
      </label>
      <SelectNativo id={`filtro-${nome}`} name={nome} defaultValue={valor ?? ""} className="w-44">
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </SelectNativo>
    </div>
  );
}
