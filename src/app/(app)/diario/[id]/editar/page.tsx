import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPapel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { listarObrasAtivas } from "@/services/obras";
import { podeVerObra } from "@/services/acesso";
import { dataParaInput } from "@/lib/format";
import {
  dataDoRdo,
  ehClima,
  normalizarEfetivo,
  normalizarEquipamentos,
  permissaoRdo,
} from "@/services/rdo";
import { RdoForm, type RdoValores } from "../../novo/rdo-form";

export default async function EditarRdoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await exigirPapel();
  const { id } = await params;

  const rdo = await prisma.diarioObra.findUnique({
    where: { id },
    include: { fotos: { orderBy: { id: "asc" } } },
  });
  if (!rdo || !podeVerObra(user.obrasPermitidas, rdo.obraId)) notFound();

  const permissao = permissaoRdo(user, rdo);
  if (!permissao.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl">Editar RDO</h1>
        <p className="text-muted-foreground">{permissao.erro}.</p>
        <Button variant="outline" render={<Link href={`/diario/${rdo.id}`} />}>
          Voltar ao RDO
        </Button>
      </div>
    );
  }

  // inclui a obra do RDO mesmo que já tenha sido concluída/pausada
  const obras = await listarObrasAtivas([rdo.obraId], user.obrasPermitidas);

  const valores: RdoValores = {
    obraId: rdo.obraId,
    data: dataParaInput(dataDoRdo(rdo.data)),
    climaManha: rdo.climaManha && ehClima(rdo.climaManha) ? rdo.climaManha : "",
    climaTarde: rdo.climaTarde && ehClima(rdo.climaTarde) ? rdo.climaTarde : "",
    climaLegado: rdo.clima,
    condicao: rdo.condicao ?? "",
    efetivo: normalizarEfetivo(rdo.efetivo),
    equipamentos: normalizarEquipamentos(rdo.equipamentos),
    atividades: rdo.atividades,
    ocorrencias: rdo.ocorrencias ?? "",
    fotos: rdo.fotos.map((f) => ({ url: f.url })),
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl md:text-3xl">Editar RDO</h1>
      <RdoForm obras={obras} rdo={{ id: rdo.id, valores }} />
    </div>
  );
}
