import type { Metadata } from "next";
import Link from "next/link";
import { Ban, FileSearch, Upload } from "lucide-react";
import { exigirPapel } from "@/lib/auth";
import { formatarData, formatarDocumento, formatarMoeda } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { EstadoVazio } from "@/components/estado-vazio";
import { LinkVoltar } from "@/components/link-voltar";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatarCno } from "@/services/cno";
import { listarRecebidas } from "@/services/sefaz/painel";
import { descartarDocumento } from "../../sefaz/actions";

export const metadata: Metadata = { title: "NF-e recebidas" };

export default async function RecebidasPage() {
  const usuario = await exigirPapel("ADMIN", "ESCRITORIO");
  const recebidas = await listarRecebidas();
  type Recebida = (typeof recebidas)[number];
  const prontas = recebidas.filter((r) => r.situacao === "COMPLETO").length;

  const colunas: ColunaDados<Recebida>[] = [
    {
      id: "emitente",
      titulo: "Fornecedor (emitente)",
      papel: "titulo",
      celula: (r) => (
        <>
          <span className="font-medium">{r.emitenteNome}</span>
          <span className="block text-xs text-muted-foreground num">{formatarDocumento(r.emitenteDoc)}</span>
        </>
      ),
    },
    { id: "valor", titulo: "Valor", papel: "valor", numerica: true, celula: (r) => formatarMoeda(r.valorCents) },
    {
      id: "obra",
      titulo: "Obra (CNO)",
      celula: (r) =>
        !r.cno ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {r.obrasDoCno.length > 0 ? (
              <span className="font-medium">{r.obrasDoCno.join(", ")}</span>
            ) : (
              <StatusBadge estado="neutro">Sem obra com este CNO</StatusBadge>
            )}
            <span className="block text-xs text-muted-foreground num">{formatarCno(r.cno)}</span>
          </>
        ),
    },
    {
      id: "situacao",
      titulo: "Situação",
      papel: "estado",
      celula: (r) =>
        r.situacao === "COMPLETO" ? (
          <StatusBadge estado="atencao">Pronta para lançar</StatusBadge>
        ) : (
          <StatusBadge estado="andamento">Aguardando XML da Sefaz</StatusBadge>
        ),
    },
    { id: "nota", titulo: "NF / série", celula: (r) => `${r.numero} / ${r.serie}` },
    { id: "emissao", titulo: "Emissão", celula: (r) => formatarData(r.dataEmissao) },
    {
      id: "acoes",
      titulo: "Ações",
      papel: "acao",
      tituloOculto: true,
      celula: (r) => (
        <div className="flex flex-wrap justify-end gap-1">
          {r.situacao === "COMPLETO" && (
            <Button size="sm" render={<Link href={`/notas/importar-xml?recebida=${r.id}`} />}>
              <Upload className="size-4" /> Lançar
            </Button>
          )}
          <ConfirmButton
            action={descartarDocumento.bind(null, r.id)}
            mensagem="Descartar esta NF-e? Use quando a compra não é da empresa ou já foi tratada fora do sistema."
            variant="ghost"
            rotulo={`Descartar NF ${r.numero} de ${r.emitenteNome}`}
          >
            <Ban className="size-4" /> <span className="hidden sm:inline">Descartar</span>
          </ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <LinkVoltar href="/notas">Lançamentos</LinkVoltar>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl md:text-3xl">NF-e recebidas</h1>
          {usuario.role === "ADMIN" && (
            <Button variant="outline" render={<Link href="/sefaz" />}>
              Acompanhar a captura
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Notas que fornecedores emitiram contra o CNPJ da empresa, trazidas da Sefaz. Ao lançar, você define
          as obras e confere itens e parcelas, como na importação de XML.
        </p>
      </div>

      {recebidas.length === 0 ? (
        <EstadoVazio icone={FileSearch} titulo="Nenhuma NF-e esperando lançamento">
          As NF-e emitidas contra o CNPJ da empresa aparecem aqui assim que a Sefaz as libera.
        </EstadoVazio>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {prontas} pronta{prontas === 1 ? "" : "s"} para lançar
            {recebidas.length > prontas && ` · ${recebidas.length - prontas} aguardando o XML completo (chega em até 1–2 h depois da Ciência)`}
          </p>
          <ListaDeDados legenda="NF-e recebidas" linhas={recebidas} chave={(r) => r.id} colunas={colunas} />
        </>
      )}
    </div>
  );
}
