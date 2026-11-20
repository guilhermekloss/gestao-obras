import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { ConfirmButton } from "@/components/confirm-button";
import { formatarData, formatarMoeda } from "@/lib/format";
import { EditarMaterialDialog, MesclarMaterialButton } from "../material-dialogs";
import { excluirMaterial, removerApelido } from "../actions";
import { Trash2 } from "lucide-react";
import { LinkVoltar } from "@/components/link-voltar";
import { carregarCustoEfetivoDoMaterial } from "@/services/tributacao/custo-efetivo-db";
import { MESES_PADRAO, PERIODOS_MESES } from "@/services/tributacao/custo-efetivo";
import { CustoEfetivoCard } from "./custo-efetivo-card";

export const metadata: Metadata = { title: "Material" };

export default async function MaterialDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meses?: string }>;
}) {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");
  const { id } = await params;
  const { meses: mesesTexto } = await searchParams;
  const meses = PERIODOS_MESES.find((m) => String(m) === mesesTexto) ?? MESES_PADRAO;

  const [material, outros, custo] = await Promise.all([
    prisma.material.findUnique({
      where: { id },
      include: {
        apelidos: { orderBy: { criadoEm: "asc" }, include: { fornecedor: { select: { nome: true } } } },
        itens: {
          orderBy: { nota: { dataCompra: "desc" } },
          take: 20,
          include: { nota: { select: { id: true, numero: true, dataCompra: true, fornecedor: { select: { nome: true } } } } },
        },
        _count: { select: { itens: true } },
      },
    }),
    prisma.material.findMany({ where: { NOT: { id } }, select: { id: true, nome: true, unidade: true }, orderBy: { nome: "asc" } }),
    carregarCustoEfetivoDoMaterial(id, { meses }),
  ]);
  if (!material) notFound();

  const apelidosTexto = material.apelidos.filter((a) => !a.codigoProduto);
  const apelidosCodigo = material.apelidos.filter((a) => a.codigoProduto);

  const colunasCompras: ColunaDados<(typeof material.itens)[number]>[] = [
    {
      id: "compra",
      titulo: "Data",
      papel: "titulo",
      celula: (i) => (
        <Link href={`/notas/${i.nota.id}`} className={LINK_DA_LINHA}>
          {formatarData(i.nota.dataCompra)} · NF {i.nota.numero}
        </Link>
      ),
    },
    { id: "fornecedor", titulo: "Fornecedor", celula: (i) => i.nota.fornecedor.nome },
    { id: "qtde", titulo: "Qtde", numerica: true, celula: (i) => `${Number(i.qtde)} ${i.unidade}` },
    {
      id: "unitario",
      titulo: "Unitário",
      papel: "valor",
      numerica: true,
      celula: (i) => formatarMoeda(i.unitCents),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <LinkVoltar href="/materiais">Materiais</LinkVoltar>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl">{material.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {material.unidade} · {material.categoria ?? "Sem categoria"} · usado em {material._count.itens} item(ns)
            </p>
          </div>
          <div className="flex items-center gap-1">
            <EditarMaterialDialog
              material={{
                id: material.id,
                nome: material.nome,
                unidade: material.unidade,
                tipo: material.tipo,
                categoria: material.categoria,
              }}
            />
            {user.role === "ADMIN" && (
              <ConfirmButton
                action={excluirMaterial.bind(null, material.id)}
                mensagem={`Excluir o material ${material.nome}?`}
                rotulo={`Excluir o material ${material.nome}`}
                variant="ghost"
                size="icon"
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </ConfirmButton>
            )}
          </div>
        </div>
      </div>

      <CustoEfetivoCard custo={custo} materialId={material.id} podeInformarRegime={user.role === "ADMIN"} />

      <Card>
        <CardHeader>
          <CardTitle>Apelidos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Descrições de notas já ligadas a este material. Uma nota nova com o mesmo texto (ou o mesmo código do fornecedor) se liga sozinha.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {material.apelidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum apelido ainda.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {[...apelidosTexto, ...apelidosCodigo].map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {a.descricaoOriginal}
                    {a.codigoProduto && <span className="ml-2 text-xs text-muted-foreground">código {a.codigoProduto}</span>}
                    {a.fornecedor && <span className="ml-2 text-xs text-muted-foreground">· {a.fornecedor.nome}</span>}
                  </span>
                  <ConfirmButton
                    action={removerApelido.bind(null, a.id)}
                    mensagem="Remover este apelido? Notas com este texto deixam de se ligar sozinhas."
                    rotulo={`Remover o apelido ${a.descricaoOriginal}`}
                    variant="ghost"
                    size="icon"
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
          <MesclarMaterialButton origemId={material.id} origemNome={material.nome} opcoes={outros} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimas compras</CardTitle>
        </CardHeader>
        <CardContent>
          {material.itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não foi lançado em nenhuma nota.</p>
          ) : (
            <ListaDeDados
              legenda="Últimas compras do material"
              linhas={material.itens}
              chave={(i) => i.id}
              colunas={colunasCompras}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
