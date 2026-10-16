import { EscolhaMaterial } from "../escolha-material";
import type { MaterialCatalogo, VinculoMaterial } from "@/services/materiais";
import Link from "next/link";
import type { TipoItem } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectNativo } from "@/components/select-nativo";
import { CampoAjuda } from "@/components/campo-ajuda";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData, formatarMoeda } from "@/lib/format";
import { formatarDocumento, type Nfe } from "@/services/nfe-xml";
import type { SituacaoImportacao } from "./actions";
import { AlertTriangle, CheckCircle2, ExternalLink, UserPlus } from "lucide-react";

const TIPOS: { value: TipoItem; label: string }[] = [
  { value: "MATERIAL", label: "Material" },
  { value: "SERVICO", label: "Serviço" },
  { value: "FRETE", label: "Frete" },
  { value: "ENCARGO", label: "Encargo" },
];

const FORMA_LABELS: Record<string, string> = {
  PIX: "PIX",
  CARTAO: "Cartão",
  DEBITO: "Débito",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  DINHEIRO: "Dinheiro",
};

function formatarChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatarQtde(qtde: number): string {
  return qtde.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// sem passar por fuso horário
export function formatarDataXml(data: string): string {
  return formatarData(`${data}T12:00:00`);
}

export function AvisoNotaExistente({ notaId, mensagem }: { notaId: string; mensagem: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{mensagem}</span>
      <Link href={`/notas/${notaId}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
        Abrir a nota <ExternalLink className="size-3.5" />
      </Link>
    </div>
  );
}

export function PreviaCabecalho({ nfe, situacao }: { nfe: Nfe; situacao: SituacaoImportacao | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          NF-e {nfe.numero}
          {nfe.serie && <span className="font-normal text-muted-foreground"> · série {nfe.serie}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4 [&>div]:min-w-0">
        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground">Fornecedor (emitente)</p>
          <p className="font-medium">{nfe.emitente.razaoSocial}</p>
          <p className="text-muted-foreground">
            {nfe.emitente.tipoDocumento} {formatarDocumento(nfe.emitente.documento)}
            {nfe.emitente.fone && ` · ${nfe.emitente.fone}`}
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
          <p className="font-medium">{formatarDataXml(nfe.dataEmissao)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Valor total</p>
          <p className="text-lg font-semibold">{formatarMoeda(nfe.totalCents)}</p>
          <p className="text-xs text-muted-foreground">{FORMA_LABELS[nfe.formaPagto]}</p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-muted-foreground">Chave de acesso</p>
          <p className="font-mono text-xs break-all">{formatarChave(nfe.chave)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PreviaItens({
  nfe,
  tipos,
  onTipo,
  vinculos,
  catalogo,
  onVinculo,
}: {
  nfe: Nfe;
  tipos: TipoItem[];
  onTipo: (indice: number, tipo: TipoItem) => void;
  // um por item: ligação ao catálogo de materiais (a escolha é do usuário quando não há ligação exata)
  vinculos: VinculoMaterial[];
  catalogo: MaterialCatalogo[];
  onVinculo: (indice: number, vinculo: VinculoMaterial) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Itens
          <CampoAjuda titulo="Itens da NF-e">
            Os itens vêm do XML e não podem ser editados aqui — só o <b>tipo</b>, que classifica o
            custo nos relatórios, e o <b>material</b> do catálogo a que cada item corresponde. Frete e impostos cobrados por fora (IPI, ST, seguro, outras
            despesas) aparecem como itens próprios, para a soma fechar com o total da nota.
          </CampoAjuda>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-28 sm:w-32">Tipo</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Qtde</TableHead>
              <TableHead className="hidden text-right md:table-cell">Unitário</TableHead>
              <TableHead className="hidden text-right md:table-cell">Desconto</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nfe.itens.flatMap((item, i) => [
              <TableRow key={i} className={vinculos[i] ? "border-b-0" : undefined}>
                <TableCell className="max-w-56 whitespace-normal md:max-w-none">
                  <p className={item.origem === "PRODUTO" ? "font-medium" : "italic"}>{item.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="sm:hidden">
                      {formatarQtde(item.qtde)} {item.unidade}
                      {item.ncm && " · "}
                    </span>
                    {item.ncm && `NCM ${item.ncm}`}
                  </p>
                </TableCell>
                <TableCell>
                  <SelectNativo
                    aria-label={`Tipo do item ${i + 1}`}
                    className="h-8 text-sm"
                    value={tipos[i]}
                    onChange={(e) => onTipo(i, e.target.value as TipoItem)}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </SelectNativo>
                </TableCell>
                <TableCell className="hidden text-right whitespace-nowrap sm:table-cell">
                  {formatarQtde(item.qtde)} {item.unidade}
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">{formatarMoeda(item.unitCents)}</TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {item.descontoCents ? formatarMoeda(item.descontoCents) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium">{formatarMoeda(item.totalCents)}</TableCell>
              </TableRow>,
              vinculos[i] && (
                <TableRow key={`material-${i}`}>
                  <TableCell colSpan={6} className="pt-0 whitespace-normal">
                    <EscolhaMaterial
                      vinculo={vinculos[i]}
                      descricao={item.descricao}
                      unidade={item.unidade}
                      catalogo={catalogo}
                      onChange={(v) => onVinculo(i, v)}
                    />
                  </TableCell>
                </TableRow>
              ),
            ])}
          </TableBody>
          <TableFooter>
            <TableRow>
              {/* colSpan cobre todas as colunas, visíveis ou não, em qualquer largura */}
              <TableCell colSpan={6}>
                <div className="flex justify-between">
                  <span>Total da nota</span>
                  <span>{formatarMoeda(nfe.totalCents)}</span>
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
