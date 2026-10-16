import Link from "next/link";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaFiltro } from "@/services/obras";
import { descreverAcessoObras, ROLE_LABELS } from "@/services/acesso";
import { CATEGORIA_LABELS, situacaoDeUso, type CategoriaAtividade } from "@/services/atividade";
import { STATUS_CONVITE_LABELS, type StatusConvite } from "@/services/convite";
import { formatarData, formatarTempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectNativo } from "@/components/select-nativo";
import { NovoUsuarioDialog, EditarUsuarioDialog } from "./usuario-dialogs";
import { AcoesConvite, NovoConviteDialog } from "./convite-dialogs";
import { FeedAtividades } from "./feed-atividades";
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
      {aba.key === "convites" && <AbaConvites />}
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
  if (situacao === "nunca") return <Badge variant="outline">Nunca entrou</Badge>;
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
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead className="hidden lg:table-cell">Obras</TableHead>
            <TableHead className="hidden md:table-cell">Último acesso</TableHead>
            <TableHead className="hidden md:table-cell">Últimos 30 dias</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id} className={cn(!u.ativo && "opacity-60")}>
              <TableCell>
                <Link href={`/usuarios/${u.id}`} className="font-medium hover:underline">
                  {u.nome}
                </Link>
                <span className="block text-xs text-muted-foreground">{u.email}</span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                  {!u.ativo && <Badge variant="outline">Desativado</Badge>}
                </div>
              </TableCell>
              <TableCell className="hidden text-sm lg:table-cell">
                {descreverAcessoObras(u.role, u.todasObras, u.nomesObras)}
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                <UltimoAcesso u={u} agora={agora} />
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                <ResumoProducao u={u} />
              </TableCell>
              <TableCell>
                <EditarUsuarioDialog usuario={paraEdicao(u)} obras={obras} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const COR_STATUS: Record<StatusConvite, "default" | "secondary" | "outline" | "destructive"> = {
  PENDENTE: "default",
  ACEITO: "secondary",
  EXPIRADO: "outline",
  REVOGADO: "outline",
};

async function AbaConvites() {
  const convites = await carregarConvites();
  if (convites.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum convite ainda. Use “Convidar por link” para a pessoa fazer o próprio cadastro.
      </p>
    );
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Convidado</TableHead>
            <TableHead>Papel e obras</TableHead>
            <TableHead className="hidden md:table-cell">Situação</TableHead>
            <TableHead className="hidden lg:table-cell">Criado por</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {convites.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {c.usuario ? (
                  <Link href={`/usuarios/${c.usuario.id}`} className="font-medium hover:underline">
                    {c.usuario.nome}
                  </Link>
                ) : (
                  <span className="font-medium">{c.nome ?? c.email ?? "Qualquer pessoa com o link"}</span>
                )}
                {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
              </TableCell>
              <TableCell className="text-sm">
                <Badge variant="secondary">{ROLE_LABELS[c.role]}</Badge>
                <span className="block text-xs text-muted-foreground">
                  {descreverAcessoObras(c.role, c.todasObras, c.nomesObras)}
                </span>
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                <Badge variant={COR_STATUS[c.status]}>{STATUS_CONVITE_LABELS[c.status]}</Badge>
                <span className="block text-xs text-muted-foreground">
                  {c.status === "ACEITO" && c.usadoEm
                    ? `em ${formatarData(c.usadoEm)}`
                    : c.status === "PENDENTE"
                      ? `vale até ${formatarData(c.expiraEm)}`
                      : c.status === "EXPIRADO"
                        ? `expirou em ${formatarData(c.expiraEm)}`
                        : ""}
                </span>
              </TableCell>
              <TableCell className="hidden text-sm lg:table-cell">
                {c.criadoPor?.nome ?? "—"}
                <span className="block text-xs text-muted-foreground">{formatarData(c.criadoEm)}</span>
              </TableCell>
              <TableCell>
                {c.status !== "ACEITO" && <AcoesConvite id={c.id} podeCancelar={c.status === "PENDENTE"} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
            vazio="Nenhuma ação registrada com estes filtros. O log começa a contar a partir desta versão da plataforma."
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
