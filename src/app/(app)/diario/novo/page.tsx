import { exigirPapel } from "@/lib/auth";
import { listarObrasAtivas } from "@/services/obras";
import { RdoForm } from "./rdo-form";

export default async function NovoRdoPage() {
  await exigirPapel();

  const obras = await listarObrasAtivas();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo RDO</h1>
      <RdoForm obras={obras} />
    </div>
  );
}
