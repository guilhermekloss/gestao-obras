import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDocumento, formatarMoeda } from "@/lib/format";
import { formatarCno } from "@/services/cno";
import type { Nfse } from "@/services/nfse-xml";
import { CRT_LABELS } from "@/services/tributacao/ibs-cbs";
import type { SituacaoImportacao } from "./actions";
import { formatarDataXml } from "./previa-nfe";
import { VisualizacaoNfse } from "../visualizacao-nfse";
import { CheckCircle2, UserPlus } from "lucide-react";

// Prévia da NFS-e: o resumo do que entra no lançamento e, abaixo, a nota no estilo do DANFSe para conferir.
export function PreviaNfse({ nfse, situacao }: { nfse: Nfse; situacao: SituacaoImportacao | null }) {
  const retido = nfse.retencoes.totalCents;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          NFS-e {nfse.numero}
          {nfse.dataCompetencia && (
            <span className="font-normal text-muted-foreground"> · competência {formatarDataXml(nfse.dataCompetencia).slice(3)}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4 [&>div]:min-w-0">
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Fornecedor (prestador)</p>
            <p className="font-medium">{nfse.emitente.razaoSocial}</p>
            <p className="text-muted-foreground">
              {nfse.emitente.tipoDocumento} {formatarDocumento(nfse.emitente.documento)}
              {nfse.crtEmitente && ` · ${CRT_LABELS[nfse.crtEmitente]}`}
            </p>
            {situacao &&
              (situacao.fornecedor ? (
                <Badge variant="secondary" className="mt-1 h-auto max-w-full whitespace-normal">
                  <CheckCircle2 className="size-3" /> Já cadastrado como &ldquo;{situacao.fornecedor.nome}&rdquo;
                </Badge>
              ) : (
                <Badge variant="outline" className="mt-1 h-auto max-w-full whitespace-normal">
                  <UserPlus className="size-3" /> Será cadastrado ao importar
                </Badge>
              ))}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Emissão</p>
            <p className="font-medium">{formatarDataXml(nfse.dataEmissao)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Custo da obra (valor do serviço)</p>
            <p className="text-lg font-semibold">{formatarMoeda(nfse.totalCents)}</p>
            {retido > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatarMoeda(nfse.aPagarPrestadorCents)} ao prestador + {formatarMoeda(retido)} em guias
              </p>
            )}
          </div>
          {nfse.cno && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground">CNO da obra</p>
              <p className="font-medium num">{formatarCno(nfse.cno)}</p>
            </div>
          )}
        </div>
        <VisualizacaoNfse nfse={nfse} />
      </CardContent>
    </Card>
  );
}
