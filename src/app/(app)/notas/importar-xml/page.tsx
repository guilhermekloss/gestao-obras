import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exigirPapel } from "@/lib/auth";
import { listarObrasParaRateio } from "@/services/obras";
import { listarMateriais } from "@/services/materiais-db";
import { xmlDaRecebida } from "@/services/sefaz/painel";
import { AvisoDePagina } from "@/components/aviso-de-pagina";
import { ImportarXmlForm } from "./importar-xml-form";

export const metadata: Metadata = { title: "Importar XML da NF-e" };

export default async function ImportarXmlPage({ searchParams }: { searchParams: Promise<{ recebida?: string }> }) {
  await exigirPapel("ADMIN", "ESCRITORIO");
  const { recebida } = await searchParams;
  const [obras, materiais, xmlRecebido] = await Promise.all([
    listarObrasParaRateio(),
    listarMateriais(),
    // NF-e trazida da Sefaz (caixa de recebidas): o XML já vem carregado
    recebida ? xmlDaRecebida(recebida) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl">Importar XML da NF-e</h1>
        <p className="text-sm text-muted-foreground">
          Envie o arquivo .xml que o fornecedor manda junto com a nota. Fornecedor, itens, total e
          parcelas são preenchidos a partir dele; você só define o rateio entre as obras.
        </p>
      </div>
      {recebida && !xmlRecebido && (
        <AvisoDePagina
          icone={TriangleAlert}
          tom="atencao"
          titulo="NF-e indisponível"
          acoes={
            <Button variant="outline" render={<Link href="/notas/recebidas" />}>
              Ver NF-e recebidas
            </Button>
          }
        >
          Esta NF-e recebida não está mais disponível para lançar (já foi lançada ou descartada).
        </AvisoDePagina>
      )}
      <ImportarXmlForm obras={obras} materiais={materiais} xmlInicial={xmlRecebido ?? undefined} />
    </div>
  );
}
