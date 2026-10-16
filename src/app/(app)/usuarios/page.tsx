import Link from "next/link";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaFiltro } from "@/services/obras";
import { descreverAcessoObras, ROLE_LABELS } from "@/services/acesso";
import { CATEGORIA_LABELS, situacaoDeUso, type CategoriaAtividade } from "@/services/atividade";
import { STATUS_CONVITE_LABELS, type StatusConvite } from "@/services/convite";
import { formatarData, formatarTempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
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
import { MailPlus } from "lucide-react";
import {
  ATIVIDADES_POR_PAGINA,
  carregarConvites,
  carregarListaUsuarios,
  listarAtividades,
  paraEdicao,
  type UsuarioDaLista,
} from "./dados";

const ABAS = [
  { key: "pessoas", label: "Pessoas" },
  { key: "convites", label: "Convites" },
  { key: "atividade", label: "Atividade" },
] as const;

type Busca = { aba?: string; usuario?: string; obra?: string; categoria?: string; pagina?: string };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPapel("ADMIN");
  const busca = await searchParams;
  const aba = ABAS.find((a) => a.key === busca.aba) ?? ABAS[0];

  const [{ usuarios, convitesPendentes }, obras] = await Promise.all([
    carregarListaUsuarios(),
    listarObrasParaFiltro(),
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

      <nav className="flex gap-1 border-b">
        {ABAS.map((a) => (
          <Link
            key={a.key}
            href={a.key === "pessoas" ? "/usuarios" : `/usuarios?aba=${a.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              a.key === aba.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.label}
            {a.key === "convites" && convitesPendentes > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {convitesPendentes}
              </Badge>
            )}
          </Link>
        ))}
      </nav>

      {aba.key === "pessoas" && <AbaPessoas usuarios={usuarios} obras={obras} agora={agora} />}
      {aba.key === "convites" && <AbaConvites obras={obras} />}
      {aba.key === "atividade" && <AbaAtividade busca={busca} usuarios={usuarios} obras={obras} />}
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
