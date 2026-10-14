"use client";

import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TipoItem } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SelectNativo } from "@/components/select-nativo";
import { cn } from "@/lib/utils";
import { formatarMoeda, moedaParaCents, percentBpParaEditavel } from "@/lib/format";
import { BP_TOTAL } from "@/services/rateio";
import { FORMA_PAGTO_LABELS, TIPO_DOCUMENTO_LABELS, TIPOS_DOCUMENTO } from "@/services/financeiro";
import { formatarDocumento } from "@/services/nfe-xml";
import { MOTIVO_CANDIDATO_LABEL, palavrasDoNome } from "@/services/correspondencia-fornecedor";
import type { LeituraNormalizada } from "@/services/leitura-documento";
import { salvarNota } from "../actions";
import type { FornecedorOption, ObraOption } from "../nota-form";
import { montarPayload, somaItensForm, somaParcelasForm, somaRateioForm, totalItemForm } from "../nota-form-model";
import { resolverFornecedor, type LerDocumentoResult } from "./actions";
import {
  errosConferencia,
  escolhaParaAction,
  situacaoDocumento,
  type Conferencia,
  type EscolhaFornecedor,
} from "./conferencia-model";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  PencilLine,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

export type LeituraConferida = Extract<LerDocumentoResult, { ok: true }> & { arquivo: { nome: string; url: string } };

const TIPOS_ITEM: { value: TipoItem; label: string }[] = [
  { value: "MATERIAL", label: "Material" },
  { value: "SERVICO", label: "Serviço" },
  { value: "FRETE", label: "Frete" },
  { value: "ENCARGO", label: "Encargo" },
];

/**
 * Pop-up de conferência humana: logo após a leitura automática, mostra tudo o
 * que vai entrar no sistema ao lado do documento, permite corrigir cada campo
 * e resolve o fornecedor contra o cadastro. Só grava ao confirmar.
 */
export function ConferenciaDialog({
  aberto,
  onAbertoChange,
  dados,
  conferencia,
  setConferencia,
  fornecedores,
  obras,
  onLevarParaFormulario,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  dados: LeituraConferida;
  conferencia: Conferencia;
  setConferencia: Dispatch<SetStateAction<Conferencia>>;
  fornecedores: FornecedorOption[];
  obras: ObraOption[];
  onLevarParaFormulario: () => void;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erros, setErros] = useState<string[]>([]);
  // fornecedor já resolvido no servidor (criado/completado) — não refaz numa nova tentativa
  const [fornecedorResolvido, setFornecedorResolvido] = useState<string | null>(null);

  const { leitura, correspondencia, notaExistente, arquivo } = dados;
  const v = conferencia.valores;
  const totalCents = moedaParaCents(v.total);
  const somaItens = somaItensForm(v.itens);
  const somaParcelas = somaParcelasForm(v.parcelas, totalCents);
  const somaRateio = somaRateioForm(v.rateios);

  function setValores(parcial: Partial<Conferencia["valores"]>) {
    setConferencia((c) => ({ ...c, valores: { ...c.valores, ...parcial } }));
  }
  function setLista<K extends "itens" | "parcelas" | "rateios">(
    chave: K,
    fn: (lista: Conferencia["valores"][K]) => Conferencia["valores"][K],
  ) {
    setConferencia((c) => ({ ...c, valores: { ...c.valores, [chave]: fn(c.valores[chave]) } }));
  }
  function setFornecedor(escolha: EscolhaFornecedor) {
    setFornecedorResolvido(null);
    setConferencia((c) => ({
      ...c,
      fornecedor: escolha,
      valores: { ...c.valores, fornecedorId: escolha.modo === "existente" ? escolha.id : "" },
    }));
  }

  function confirmar(forcar = false) {
    const lista = errosConferencia(conferencia);
    setErros(lista);
    if (lista.length > 0) {
      document.getElementById("conferencia-erros")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    startTransition(async () => {
      let fornecedorId = fornecedorResolvido;
      if (!fornecedorId) {
        const escolha = escolhaParaAction(conferencia.fornecedor);
        if (!escolha) return;
        const r = await resolverFornecedor(escolha);
        if (!r.ok || !r.fornecedor) {
          setErros([r.erro ?? "Não foi possível gravar o fornecedor."]);
          return;
        }
        fornecedorId = r.fornecedor.id;
        setFornecedorResolvido(fornecedorId);
        if (r.info) toast.info(r.info);
      }

      const res = await salvarNota(montarPayload({ ...conferencia.valores, fornecedorId }, undefined, forcar));
      if (res.ok) {
        toast.success("Nota conferida e lançada");
        onAbertoChange(false);
        router.push("/notas");
        router.refresh();
      } else if (res.aviso) {
        if (confirm(res.erro)) confirmar(true);
      } else {
        setErros([res.erro ?? "Erro ao lançar a nota."]);
      }
    });
  }

  const ehPdf = /\.pdf$/i.test(arquivo.url);

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="flex max-h-[94dvh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle className="text-base font-semibold">Conferir dados da nota</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Compare com o documento e corrija o que estiver diferente. Nada é gravado antes de você confirmar.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:overflow-hidden">
          {/* Documento original */}
          <div className="border-b bg-muted/30 p-3 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1 truncate">
                <FileText className="size-3.5 shrink-0" /> {arquivo.nome}
              </span>
              <a href={arquivo.url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 hover:underline">
                Abrir <ExternalLink className="size-3" />
              </a>
            </div>
            {ehPdf ? (
              <iframe src={arquivo.url} title="Documento enviado" className="h-64 w-full rounded border bg-white lg:h-[calc(94dvh-11rem)]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido pela própria API, sem otimização
              <img src={arquivo.url} alt="Documento enviado" className="max-h-64 w-full rounded border bg-white object-contain lg:max-h-none" />
            )}
          </div>

          {/* Dados */}
          <div className="space-y-5 p-4 lg:overflow-y-auto">
            {notaExistente && (
              <Alerta tom="erro">
                Este documento já foi lançado (nº {notaExistente.numero}).{" "}
                <Link href={`/notas/${notaExistente.id}`} className="font-medium underline">
                  Abrir a nota
                </Link>
              </Alerta>
            )}
            {leitura.avisos.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                {leitura.avisos.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            )}

            <Secao titulo={`Documento · ${leitura.descricaoDocumento}`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo label="Tipo">
                  <SelectNativo
                    value={v.tipoDocumento}
                    onChange={(e) => setValores({ tipoDocumento: e.target.value as Conferencia["valores"]["tipoDocumento"] })}
                  >
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>{TIPO_DOCUMENTO_LABELS[t]}</option>
                    ))}
                  </SelectNativo>
                </Campo>
                <Campo label={v.tipoDocumento === "NF" ? "Nº da nota *" : "Nº do documento"}>
                  <Input
                    aria-label="Número"
                    value={v.numero}
                    onChange={(e) => setValores({ numero: e.target.value })}
                    className={cn(!v.numero && v.tipoDocumento === "NF" && "border-amber-500")}
                  />
                </Campo>
                <Campo label="Data de emissão *">
                  <Input aria-label="Data de emissão" type="date" value={v.dataCompra} onChange={(e) => setValores({ dataCompra: e.target.value })} />
                </Campo>
                <Campo label="Valor total (R$) *">
                  <Input aria-label="Valor total" inputMode="decimal" value={v.total} onChange={(e) => setValores({ total: e.target.value })} />
                </Campo>
              </div>
              {leitura.chaveNfe && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-green-600" /> Chave de acesso (dígito verificador confere):
                  <span className="break-all font-mono">{leitura.chaveNfe}</span>
                </p>
              )}
            </Secao>

            <Secao titulo="Fornecedor (emitente)" icone={<Building2 className="size-4" />}>
              <FornecedorConferencia
                lido={leitura.fornecedor}
                correspondencia={correspondencia}
                escolha={conferencia.fornecedor}
                onEscolha={setFornecedor}
                fornecedores={fornecedores}
              />
            </Secao>

            <Secao titulo="Destinatário / tomador">
              <Destinatario destinatario={leitura.destinatario} ehEmpresa={dados.destinatarioEhEmpresa} />
            </Secao>

            <Secao
              titulo="Itens"
              extra={<Soma ok={somaItens === totalCents} texto={`Soma ${formatarMoeda(somaItens)} de ${formatarMoeda(totalCents)}`} />}
            >
              <div className="space-y-2">
                {v.itens.map((it, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_96px_64px_56px_88px_80px_88px_32px] sm:items-end"
                  >
                    <Campo label="Descrição" className="col-span-2 sm:col-span-1">
                      <Input
                        aria-label={`Descrição do item ${i + 1}`}
                        value={it.descricao}
                        onChange={(e) => setLista("itens", (l) => l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                      />
                    </Campo>
                    <Campo label="Tipo">
                      <SelectNativo
                        value={it.tipo}
                        onChange={(e) => setLista("itens", (l) => l.map((x, j) => (j === i ? { ...x, tipo: e.target.value as TipoItem } : x)))}
                      >
                        {TIPOS_ITEM.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </SelectNativo>
                    </Campo>
                    <Campo label="Qtde">
                      <Input inputMode="decimal" value={it.qtde} onChange={(e) => setLista("itens", (l) => l.map((x, j) => (j === i ? { ...x, qtde: e.target.value } : x)))} />
                    </Campo>
                    <Campo label="Und">
                      <Input value={it.unidade} onChange={(e) => setLista("itens", (l) => l.map((x, j) => (j === i ? { ...x, unidade: e.target.value } : x)))} />
                    </Campo>
                    <Campo label="Unitário">
                      <Input inputMode="decimal" value={it.unit} onChange={(e) => setLista("itens", (l) => l.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                    </Campo>
                    <Campo label="Desconto">
                      <Input inputMode="decimal" placeholder="0,00" value={it.desconto} onChange={(e) => setLista("itens", (l) => l.map((x, j) => (j === i ? { ...x, desconto: e.target.value } : x)))} />
                    </Campo>
                    <div className="pb-2 text-right text-sm font-medium">{formatarMoeda(totalItemForm(it))}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remover item"
                      disabled={v.itens.length === 1}
                      onClick={() => setLista("itens", (l) => l.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLista("itens", (l) => [...l, { descricao: "", tipo: "MATERIAL", qtde: "1", unidade: "UN", unit: "", desconto: "" }])
                  }
                >
                  <Plus className="size-4" /> Item
                </Button>
              </div>
            </Secao>

            <Secao
              titulo="Pagamento"
              extra={<Soma ok={somaParcelas === totalCents} texto={`Parcelas ${formatarMoeda(somaParcelas)}`} />}
            >
              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <Campo label="Forma">
                  <SelectNativo
                    value={v.formaPagto}
                    onChange={(e) => setValores({ formaPagto: e.target.value as Conferencia["valores"]["formaPagto"] })}
                  >
                    {Object.entries(FORMA_PAGTO_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </SelectNativo>
                </Campo>
                <div className="space-y-2">
                  {v.parcelas.map((p, i) => (
                    <div key={i} className="grid grid-cols-[32px_1fr_1fr_32px] items-center gap-2">
                      <span className="text-sm text-muted-foreground">{i + 1}ª</span>
                      <Input
                        aria-label={`Valor da parcela ${i + 1}`}
                        inputMode="decimal"
                        value={p.valor}
                        onChange={(e) => setLista("parcelas", (l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                      />
                      <Input
                        aria-label={`Vencimento da parcela ${i + 1}`}
                        type="date"
                        value={p.vencimento}
                        onChange={(e) => setLista("parcelas", (l) => l.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Remover parcela"
                        disabled={v.parcelas.length === 1}
                        onClick={() =>
                          setLista("parcelas", (l) => l.filter((_, j) => j !== i).map((x, j) => ({ ...x, numero: j + 1 })))
                        }
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={v.parcelas.length >= 6}
                    onClick={() =>
                      setLista("parcelas", (l) => [...l, { numero: l.length + 1, valor: "", vencimento: l.at(-1)?.vencimento ?? v.dataCompra }])
                    }
                  >
                    <Plus className="size-4" /> Parcela
                  </Button>
                </div>
              </div>
            </Secao>

            <Secao
              titulo="Obra (rateio)"
              extra={<Soma ok={somaRateio === BP_TOTAL} texto={`${percentBpParaEditavel(somaRateio)}% de 100%`} />}
            >
              <div className="space-y-2">
                {v.rateios.map((r, i) => {
                  const obra = obras.find((o) => o.id === r.obraId);
                  return (
                    <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2 sm:grid-cols-[1fr_1fr_90px_32px]">
                      <SelectNativo
                        aria-label={`Obra ${i + 1}`}
                        value={r.obraId}
                        onChange={(e) =>
                          setLista("rateios", (l) => l.map((x, j) => (j === i ? { ...x, obraId: e.target.value, etapaId: "" } : x)))
                        }
                        className={cn(!r.obraId && "border-amber-500")}
                      >
                        <option value="">Selecione a obra...</option>
                        {obras.map((o) => (
                          <option key={o.id} value={o.id}>{o.nome}</option>
                        ))}
                      </SelectNativo>
                      <SelectNativo
                        aria-label={`Etapa ${i + 1}`}
                        value={r.etapaId}
                        onChange={(e) => setLista("rateios", (l) => l.map((x, j) => (j === i ? { ...x, etapaId: e.target.value } : x)))}
                        className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto"
                      >
                        <option value="">Etapa (opcional)</option>
                        {obra?.etapas.map((e) => (
                          <option key={e.id} value={e.id}>{e.nome}</option>
                        ))}
                      </SelectNativo>
                      <Input
                        aria-label={`Percentual ${i + 1}`}
                        inputMode="decimal"
                        value={r.percent}
                        onChange={(e) => setLista("rateios", (l) => l.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Remover obra"
                        disabled={v.rateios.length === 1}
                        onClick={() => setLista("rateios", (l) => l.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLista("rateios", (l) => [...l, { obraId: "", etapaId: "", percent: "" }])}
                >
                  <Plus className="size-4" /> Obra
                </Button>
              </div>
            </Secao>
          </div>
        </div>

        {/* Rodapé */}
        <div className="space-y-3 border-t bg-background px-4 py-3">
          {erros.length > 0 && (
            <ul id="conferencia-erros" role="alert" className="max-h-28 space-y-0.5 overflow-y-auto text-sm text-destructive">
              {erros.map((e, i) => (
                <li key={i} className="flex gap-1.5">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" /> {e}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={conferencia.conferido}
                onChange={(e) => setConferencia((c) => ({ ...c, conferido: e.target.checked }))}
              />
              Conferi os dados com o documento
            </label>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button type="button" variant="ghost" onClick={onLevarParaFormulario} disabled={pendente}>
                <PencilLine className="size-4" /> Editar no formulário completo
              </Button>
              <Button type="button" onClick={() => confirmar()} disabled={pendente || !!notaExistente}>
                <CheckCircle2 className="size-4" />
                {pendente ? "Lançando..." : "Confirmar e lançar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Fornecedor

function FornecedorConferencia({
  lido,
  correspondencia,
  escolha,
  onEscolha,
  fornecedores,
}: {
  lido: LeituraNormalizada["fornecedor"];
  correspondencia: LeituraConferida["correspondencia"];
  escolha: EscolhaFornecedor;
  onEscolha: (e: EscolhaFornecedor) => void;
  fornecedores: FornecedorOption[];
}) {
  const docLido = lido.documento ?? lido.documentoLido ?? "";
  const docValido = situacaoDocumento(docLido) === "valido" ? docLido : null;
  const [buscando, setBuscando] = useState(false);
  const { exato, candidatos } = correspondencia;
  const selecionado = escolha.modo === "existente" ? fornecedores.find((f) => f.id === escolha.id) ?? exato : null;
  const destacados = [
    ...(exato ? [{ ...exato, rotulo: "mesmo CNPJ/CPF — já cadastrado" }] : []),
    ...candidatos.map((c) => ({ ...c, rotulo: MOTIVO_CANDIDATO_LABEL[c.motivo] })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Lido na nota:</span>
        <span className="font-medium">{lido.nome ?? "nome não lido"}</span>
        <SeloDocumento valor={docLido} />
      </div>

      {correspondencia.nomeDivergente && exato && escolha.modo === "existente" && escolha.id === exato.id && (
        <Alerta tom="aviso">
          O CNPJ/CPF é de <b>{exato.nome}</b>, mas o nome na nota é diferente. Confira se é o mesmo fornecedor; o
          nome do cadastro é mantido.
        </Alerta>
      )}

      <div role="radiogroup" aria-label="Fornecedor" className="space-y-2">
        {destacados.map((c) => {
          const ativo = escolha.modo === "existente" && escolha.id === c.id;
          const podeCompletar = !c.cnpj && !!docValido;
          return (
            <Opcao
              key={c.id}
              ativo={ativo}
              onSelecionar={() => onEscolha({ modo: "existente", id: c.id, completarCom: podeCompletar ? docValido : null })}
              titulo={
                <>
                  Usar <b>{c.nome}</b>
                  {c.cnpj && <span className="text-muted-foreground"> · {c.cnpj}</span>}
                </>
              }
              detalhe={c.rotulo}
            >
              {ativo && podeCompletar && escolha.modo === "existente" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={!!escolha.completarCom}
                    onChange={(e) => onEscolha({ ...escolha, completarCom: e.target.checked ? docValido : null })}
                  />
                  Gravar o CNPJ/CPF {formatarDocumento(docValido!)} neste cadastro
                </label>
              )}
            </Opcao>
          );
        })}

        {selecionado && !destacados.some((d) => d.id === selecionado.id) && (
          <Opcao ativo titulo={<>Usar <b>{selecionado.nome}</b>{selecionado.cnpj && <span className="text-muted-foreground"> · {selecionado.cnpj}</span>}</>} detalhe="escolhido na busca" onSelecionar={() => undefined} />
        )}

        <Opcao
          ativo={escolha.modo === "novo"}
          onSelecionar={() =>
            escolha.modo !== "novo" && onEscolha({ modo: "novo", nome: lido.nome ?? "", documento: docLido })
          }
          titulo={<>Cadastrar novo fornecedor</>}
          detalhe={exato ? "não recomendado: este CNPJ/CPF já está cadastrado" : "com os dados lidos — confira nome e CNPJ/CPF"}
        >
          {escolha.modo === "novo" && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_220px]">
              <Campo label="Nome / razão social *">
                <Input value={escolha.nome} onChange={(e) => onEscolha({ ...escolha, nome: e.target.value })} />
              </Campo>
              <Campo label={<span className="flex items-center gap-2">CNPJ/CPF <SeloDocumento valor={escolha.documento} /></span>}>
                <Input
                  aria-label="CNPJ/CPF do novo fornecedor"
                  inputMode="numeric"
                  value={escolha.documento}
                  onChange={(e) => onEscolha({ ...escolha, documento: e.target.value })}
                />
              </Campo>
            </div>
          )}
        </Opcao>

        {buscando ? (
          <BuscaFornecedor
            fornecedores={fornecedores}
            inicial={lido.nome ?? ""}
            onEscolher={(f) => {
              onEscolha({ modo: "existente", id: f.id, completarCom: !f.cnpj && docValido ? docValido : null });
              setBuscando(false);
            }}
            onFechar={() => setBuscando(false)}
          />
        ) : (
          <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setBuscando(true)}>
            <Search className="size-3.5" /> Escolher outro fornecedor cadastrado
          </Button>
        )}
      </div>
    </div>
  );
}

function BuscaFornecedor({
  fornecedores,
  inicial,
  onEscolher,
  onFechar,
}: {
  fornecedores: FornecedorOption[];
  inicial: string;
  onEscolher: (f: FornecedorOption) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState(palavrasDoNome(inicial)[0] ?? "");
  const termos = palavrasDoNome(busca);
  const digitos = busca.replace(/\D/g, "");
  const resultados = fornecedores
    .filter((f) => {
      if (digitos.length >= 3 && (f.cnpj ?? "").replace(/\D/g, "").includes(digitos)) return true;
      const palavras = palavrasDoNome(f.nome).join(" ");
      return termos.length > 0 && termos.every((t) => palavras.includes(t));
    })
    .slice(0, 8);

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex gap-2">
        <Input autoFocus placeholder="Buscar por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button type="button" variant="ghost" onClick={onFechar}>
          Fechar
        </Button>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {resultados.map((f) => (
          <li key={f.id}>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => onEscolher(f)}>
              <span className="font-medium">{f.nome}</span>
              <span className="text-muted-foreground"> · {f.cnpj ?? "sem CNPJ/CPF"}</span>
            </button>
          </li>
        ))}
        {resultados.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum fornecedor encontrado</li>}
      </ul>
    </div>
  );
}

function Destinatario({
  destinatario,
  ehEmpresa,
}: {
  destinatario: LeituraNormalizada["destinatario"];
  ehEmpresa: boolean | null;
}) {
  const doc = destinatario.documento ?? destinatario.documentoLido ?? "";
  if (!destinatario.nome && !doc) {
    return <p className="text-sm text-muted-foreground">Não consta no documento.</p>;
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{destinatario.nome ?? "nome não lido"}</span>
        <SeloDocumento valor={doc} />
      </div>
      {ehEmpresa === true && (
        <p className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4" /> É um CNPJ da empresa.
        </p>
      )}
      {ehEmpresa === false && (
        <Alerta tom="aviso">A nota não foi emitida para um CNPJ da empresa — confira se ela é mesmo desta empresa.</Alerta>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças visuais

function Secao({
  titulo,
  icone,
  extra,
  children,
}: {
  titulo: string;
  icone?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {icone}
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Campo({ label, className, children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Soma({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", ok ? "text-green-700 dark:text-green-400" : "text-destructive")}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />} {texto}
    </span>
  );
}

function SeloDocumento({ valor }: { valor: string }) {
  const s = situacaoDocumento(valor);
  if (s === "vazio") return <span className="text-xs text-muted-foreground">CNPJ/CPF não lido</span>;
  const d = valor.replace(/\D/g, "");
  const tipo = d.length === 11 ? "CPF" : "CNPJ";
  return s === "valido" ? (
    <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
      <CheckCircle2 className="size-3.5" /> {tipo} {formatarDocumento(d)} válido
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium text-destructive">
      <XCircle className="size-3.5" /> {valor} — dígito verificador não confere
    </span>
  );
}

function Opcao({
  ativo,
  onSelecionar,
  titulo,
  detalhe,
  children,
}: {
  ativo: boolean;
  onSelecionar: () => void;
  titulo: React.ReactNode;
  detalhe: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-2.5 text-sm transition-colors",
        ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
      )}
    >
      <button type="button" role="radio" aria-checked={ativo} className="flex w-full items-start gap-2 text-left" onClick={onSelecionar}>
        <span
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
            ativo ? "border-primary" : "border-muted-foreground/40",
          )}
        >
          {ativo && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <span className="min-w-0">
          <span className="block">{titulo}</span>
          <span className="block text-xs text-muted-foreground">{detalhe}</span>
        </span>
      </button>
      {children}
    </div>
  );
}

function Alerta({ tom, children }: { tom: "erro" | "aviso"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border p-2.5 text-sm",
        tom === "erro"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
