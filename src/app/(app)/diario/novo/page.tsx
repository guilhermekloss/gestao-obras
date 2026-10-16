import { exigirPapel } from "@/lib/auth";
import { listarObrasAtivas } from "@/services/obras";
import { RdoForm } from "./rdo-form";

export default async function NovoRdoPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  const user = await exigirPapel();
  const { obra } = await searchParams;

  const obras = await listarObrasAtivas([], user.obrasPermitidas);
  const obraInicial = obra && obras.some((o) => o.id === obra) ? obra : undefined;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl md:text-3xl">Novo RDO</h1>
      <RdoForm obras={obras} obraInicial={obraInicial} />
    </div>
  );
}
