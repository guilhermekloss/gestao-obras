import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { ultimosPrecos } from "@/services/materiais-db";
import { NovoMaterialDialog } from "./material-dialogs";
import { MateriaisTabela } from "./materiais-tabela";

export default async function MateriaisPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");

  const materiais = await prisma.material.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    include: { _count: { select: { itens: true } }, apelidos: { select: { descricaoOriginal: true } } },
  });
  const precos = await ultimosPrecos(materiais.map((m) => m.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl">Materiais</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo usado nos lançamentos. As notas lidas automaticamente se ligam aqui; o que o sistema não reconhece, você decide.
          </p>
        </div>
        <NovoMaterialDialog />
      </div>
      <MateriaisTabela
        linhas={materiais.map((m) => ({
          id: m.id,
          nome: m.nome,
          unidade: m.unidade,
          categoria: m.categoria,
          usos: m._count.itens,
          apelidos: m.apelidos.map((a) => a.descricaoOriginal),
          ultimoPrecoCents: precos.get(m.id) ?? null,
        }))}
      />
    </div>
  );
}
