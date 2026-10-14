import { exigirPapel } from "@/lib/auth";
import { listarObrasParaRateio } from "@/services/obras";
import { ImportarXmlForm } from "./importar-xml-form";

export default async function ImportarXmlPage() {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const obras = await listarObrasParaRateio();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Importar XML da NF-e</h1>
        <p className="text-sm text-muted-foreground">
          Envie o arquivo .xml que o fornecedor manda junto com a nota. Fornecedor, itens, total e
          parcelas são preenchidos a partir dele; você só define o rateio entre as obras.
        </p>
      </div>
      <ImportarXmlForm obras={obras} />
    </div>
  );
}
