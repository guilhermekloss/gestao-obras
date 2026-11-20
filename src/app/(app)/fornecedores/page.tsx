import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { ConfirmButton } from "@/components/confirm-button";
import { NovoFornecedorDialog, EditarFornecedorDialog } from "./fornecedor-dialogs";
import { DependenciaBadge } from "./dependencia-badge";
import { RegimeFornecedorBadge } from "./regime-badge";
import { excluirFornecedor } from "./actions";
import { calcularDependencia } from "@/services/dependencia";
import { carregarCrtPorFornecedor } from "@/services/tributacao/custo-efetivo-db";
import { regimeDoCrt } from "@/services/tributacao/ibs-cbs";
import { formatarMoeda } from "@/lib/format";
import { ChevronRight, Trash2 } from "lucide-react";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function FornecedoresPage() {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");

  const [fornecedores, dependencia, crts] = await Promise.all([
    prisma.fornecedor.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { notas: true } } },
    }),
    calcularDependencia(),
    carregarCrtPorFornecedor(),
  ]);

  const linhas = fornecedores
    .map((f) => ({ f, dep: dependencia.get(f.id) ?? null }))
    .sort((a, b) => (b.dep?.score ?? -1) - (a.dep?.score ?? -1));

  const colunas: ColunaDados<(typeof linhas)[number]>[] = [
    {
      id: "nome",
      titulo: "Nome",
      papel: "titulo",
      classe: "tabela:font-medium",
      celula: ({ f }) => (
        <Link href={`/fornecedores/${f.id}`} className={`${LINK_DA_LINHA} gap-1`}>
          {f.nome}
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </Link>
      ),
    },
    { id: "cnpj", titulo: "CNPJ", classe: "cartao:empty:hidden", celula: ({ f }) => f.cnpj },
    {
      id: "gasto",
      titulo: "Gasto total",
      papel: "valor",
      numerica: true,
      celula: ({ dep }) => (dep ? formatarMoeda(dep.gastoCents) : "—"),
    },
    { id: "nfs", titulo: "NFs", numerica: true, celula: ({ f }) => f._count.notas },
    {
      id: "regime",
      titulo: "Regime",
      papel: "estado",
      celula: ({ f, dep }) => (dep ? <RegimeFornecedorBadge regime={regimeDoCrt(crts.get(f.id))} /> : null),
    },
    {
      id: "dependencia",
      titulo: "Dependência",
      papel: "estado",
      celula: ({ dep }) =>
        dep ? (
          <DependenciaBadge nivel={dep.nivel} score={dep.score} />
        ) : (
          <span className="text-xs text-muted-foreground">sem compras</span>
        ),
    },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      classeCabecalho: "w-24",
      celula: ({ f }) => (
        <div className="flex justify-end gap-1">
          <EditarFornecedorDialog fornecedor={f} />
          {user.role === "ADMIN" && (
            <ConfirmButton
              action={excluirFornecedor.bind(null, f.id)}
              mensagem={`Excluir o fornecedor "${f.nome}"?`}
              rotulo={`Excluir o fornecedor ${f.nome}`}
              variant="ghost"
              size="icon"
            >
              <Trash2 className="size-4 text-muted-foreground" />
            </ConfirmButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl">Fornecedores</h1>
        <NovoFornecedorDialog />
      </div>

      {fornecedores.length === 0 ? (
        <p className="text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>
      ) : (
        <ListaDeDados
          legenda="Fornecedores"
          linhas={linhas}
          chave={({ f }) => f.id}
          colunas={colunas}
        />
      )}
    </div>
  );
}
