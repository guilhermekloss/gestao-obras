import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmButton } from "@/components/confirm-button";
import { formatarData, formatarMoeda } from "@/lib/format";
import { EditarMaterialDialog, MesclarMaterialButton } from "../material-dialogs";
import { excluirMaterial, removerApelido } from "../actions";
import { ArrowLeft, Trash2 } from "lucide-react";

export default async function MaterialDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await exigirPapel("ADMIN", "ESCRITORIO");
  const { id } = await params;

  const [material, outros] = await Promise.all([
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
  ]);
  if (!material) notFound();

  const apelidosTexto = material.apelidos.filter((a) => !a.codigoProduto);
  const apelidosCodigo = material.apelidos.filter((a) => a.codigoProduto);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/materiais" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Materiais
        </Link>
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
                variant="ghost"
                size="icon"
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </ConfirmButton>
            )}
          </div>
        </div>
      </div>

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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Qtde</TableHead>
                    <TableHead className="text-right">Unitário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {material.itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link href={`/notas/${i.nota.id}`} className="hover:underline">
                          {formatarData(i.nota.dataCompra)} · NF {i.nota.numero}
                        </Link>
                      </TableCell>
                      <TableCell>{i.nota.fornecedor.nome}</TableCell>
                      <TableCell className="text-right">{Number(i.qtde)} {i.unidade}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(i.unitCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
