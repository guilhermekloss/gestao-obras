import { EscolhaMaterial } from "../escolha-material";
import type { MaterialCatalogo, VinculoMaterial } from "@/services/materiais";
import Link from "next/link";
import type { TipoItem } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectNativo } from "@/components/select-nativo";
import { ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { formatarData, formatarMoeda } from "@/lib/format";
import { formatarDocumento, type Nfe } from "@/services/nfe-xml";
import { formatarCno } from "@/services/cno";
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
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg">
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
        {nfe.cno && (
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs text-muted-foreground">CNO da obra</p>
            <p className="font-medium num">{formatarCno(nfe.cno)}</p>
          </div>
        )}
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
  // NF-e ou NFS-e: só os itens (a NFS-e traz o NBS) e o total
  nfe: { itens: (Nfe["itens"][number] & { nbs?: string | null })[]; totalCents: number };
  tipos: TipoItem[];
  onTipo: (indice: number, tipo: TipoItem) => void;
  // um por item: ligação ao catálogo de materiais (a escolha é do usuário quando não há ligação exata)
  vinculos: VinculoMaterial[];
  catalogo: MaterialCatalogo[];
  onVinculo: (indice: number, vinculo: VinculoMaterial) => void;
}) {
  const colunas: ColunaDados<{ item: (typeof nfe.itens)[number]; i: number }>[] = [
    {
      id: "descricao",
      titulo: "Descrição",
      papel: "titulo",
      classe: "tabela:whitespace-normal",
      celula: ({ item }) => (
        <>
          <p className={item.origem === "PRODUTO" ? "font-medium" : "italic"}>{item.descricao}</p>
          {item.ncm && <p className="text-xs font-normal text-muted-foreground">NCM {item.ncm}</p>}
          {item.nbs && <p className="text-xs font-normal text-muted-foreground">NBS {item.nbs}</p>}
        </>
      ),
    },
    {
      id: "tipo",
      titulo: "Tipo",
      papel: "estado",
      classeCabecalho: "w-32",
      celula: ({ i }) => (
        <SelectNativo
          aria-label={`Tipo do item ${i + 1}`}
          className="h-8 text-sm pointer-coarse:h-10 cartao:h-10 cartao:w-40"
          value={tipos[i]}
          onChange={(e) => onTipo(i, e.target.value as TipoItem)}
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectNativo>
      ),
    },
    {
      id: "qtde",
      titulo: "Qtde",
      numerica: true,
      celula: ({ item }) => `${formatarQtde(item.qtde)} ${item.unidade}`,
    },
    { id: "unitario", titulo: "Unitário", numerica: true, celula: ({ item }) => formatarMoeda(item.unitCents) },
    {
      id: "desconto",
      titulo: "Desconto",
      numerica: true,
      celula: ({ item }) => (item.descontoCents ? formatarMoeda(item.descontoCents) : null),
    },
    {
      id: "total",
      titulo: "Total",
      papel: "valor",
      numerica: true,
      celula: ({ item }) => formatarMoeda(item.totalCents),
    },
  ];

  // vai dentro da seção "Itens" do formulário (que já tem título e resumo)
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Os itens vêm do XML e não podem ser editados aqui. Você escolhe só o tipo, que classifica o custo nos
        relatórios, e o material do catálogo de cada item. Frete e impostos cobrados por fora (IPI, ST, seguro,
        outras despesas) aparecem como itens próprios, para a soma fechar com o total da nota.
      </p>
      <ListaDeDados
        legenda="Itens da nota"
        linhas={nfe.itens.map((item, i) => ({ item, i }))}
        chave={({ i }) => String(i)}
        colunas={colunas}
        classeDaLinha={({ i }) => (vinculos[i] ? "tabela:border-b-0" : undefined)}
        linhaExtra={({ item, i }) =>
          vinculos[i] && (
            <EscolhaMaterial
              vinculo={vinculos[i]}
              descricao={item.descricao}
              unidade={item.unidade}
              catalogo={catalogo}
              onChange={(v) => onVinculo(i, v)}
            />
          )
        }
        rodape={
          <div className="flex justify-between">
            <span>Total da nota</span>
            <span className="num">{formatarMoeda(nfe.totalCents)}</span>
          </div>
        }
      />
    </div>
  );
}
