"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { SelectNativo } from "@/components/select-nativo";
import { Combobox } from "@/components/combobox";
import { BarraDeAcao } from "@/components/barra-de-acao";
import { CabecalhoSecao } from "@/components/cabecalho-secao";
import { CampoForm, MensagemErro, atributosDoErro, idDoErro } from "@/components/campo-form";
import { ConfirmarDialog } from "@/components/confirmar-dialog";
import { ResumoLancamento } from "@/components/resumo-lancamento";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { centsParaEditavel, formatarMoeda, moedaParaCents, dataParaInput, percentBpParaEditavel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BP_TOTAL } from "@/services/rateio";
import { FORMA_PAGTO_LABELS, TIPO_DOCUMENTO_LABELS, TIPOS_DOCUMENTO, exigeNumero } from "@/services/financeiro";
import type { ParcelaExistente } from "@/services/parcelas";
import { salvarNota, criarFornecedorInline } from "./actions";
import { consultarPrecoSugerido, criarMaterialInline } from "../materiais/actions";
import type { MaterialCatalogo } from "@/services/materiais";
import { UNIDADES_PADRAO } from "@/services/materiais";
import {
  dividirIgualmenteForm,
  gerarParcelasForm,
  montarPayload,
  parseQtde,
  situacaoParcelasPagas,
  somaItensForm,
  somaParcelasForm,
  somaRateioForm,
  tipoItemSugerido,
  totalItemForm,
  type ItemForm,
  type NotaFormValues,
} from "./nota-form-model";
import { avisoItensDiferemDoTotal, linhasDeConferencia } from "./conferencia-lancamento";
import { FileText, Package, Paperclip, Percent, Plus, Trash2, Wallet, Wand2, X } from "lucide-react";

export type FornecedorOption = { id: string; nome: string; cnpj?: string | null };
export type ObraOption = {
  id: string;
  nome: string;
  etapas: { id: string; nome: string }[];
};

const ITEM_VAZIO: ItemForm = {
  materialId: "",
  descricao: "",
  tipo: "MATERIAL",
  qtde: "1",
  unidade: "PC",
  unit: "",
  desconto: "",
};

const TIPOS = [
  { value: "MATERIAL", label: "Material" },
  { value: "SERVICO", label: "Serviço" },
  { value: "FRETE", label: "Frete" },
  { value: "ENCARGO", label: "Encargo" },
];

const FORMAS = Object.entries(FORMA_PAGTO_LABELS).map(([value, label]) => ({ value, label }));

type SecaoId = "documento" | "itens" | "rateio" | "pagamento";
const SECOES: SecaoId[] = ["documento", "itens", "rateio", "pagamento"];

// qual seção abre quando a linha da conferência é tocada
const SECAO_DA_LINHA: Record<string, SecaoId> = { itens: "itens", rateio: "rateio", parcelas: "pagamento" };

function secoesComErro(erros: FieldErrors<NotaFormValues>): SecaoId[] {
  const achadas: SecaoId[] = [];
  if (erros.fornecedorId || erros.numero || erros.dataCompra || erros.total) achadas.push("documento");
  if (erros.itens) achadas.push("itens");
  if (erros.rateios) achadas.push("rateio");
  if (erros.parcelas) achadas.push("pagamento");
  return achadas;
}

// espera a seção abrir antes de mover o foco (campo dentro de painel fechado não recebe foco)
function depoisDeAbrir(acao: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(acao));
}

function dataCurta(iso: string): string {
  return iso ? iso.split("-").reverse().join("/") : "";
}

export function NotaForm({
  fornecedores: fornecedoresIniciais,
  obras,
  defaultValues,
  notaId,
  parcelasExistentes = [],
  fornecedorSugerido,
  materiais: materiaisIniciais = [],
}: {
  materiais?: MaterialCatalogo[];
  fornecedores: FornecedorOption[];
  obras: ObraOption[];
  defaultValues?: Partial<NotaFormValues>;
  notaId?: string;
  parcelasExistentes?: ParcelaExistente[];
  fornecedorSugerido?: { nome: string; documento: string | null };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pendente, startTransition] = useTransition();
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [dialogFornecedor, setDialogFornecedor] = useState(false);
  const [cadastrandoSugerido, startCadastroSugerido] = useTransition();
  const [materiais, setMateriais] = useState(materiaisIniciais);
  const [itemNovoMaterial, setItemNovoMaterial] = useState<number | null>(null);
  const [secoes, setSecoes] = useState<SecaoId[]>(SECOES);
  // só depois da primeira tentativa de salvar o rateio e as parcelas ganham mensagem de erro
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ mensagem: string; valores: NotaFormValues } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    setFocus,
    formState: { errors },
  } = useForm<NotaFormValues>({
    mode: "onTouched",
    shouldFocusError: false,
    defaultValues: {
      fornecedorId: "",
      tipoDocumento: "NF",
      numero: "",
      dataCompra: dataParaInput(new Date()),
      total: "",
      formaPagto: "PIX",
      numParcelas: "1",
      obs: "",
      anexoUrl: "",
      anexoNome: "",
      chaveNfe: "",
      itens: [ITEM_VAZIO],
      rateios: [{ obraId: obras[0]?.id ?? "", etapaId: "", percent: "100" }],
      parcelas: [],
      ...defaultValues,
    },
  });

  const itensArr = useFieldArray({ control, name: "itens" });
  const rateiosArr = useFieldArray({ control, name: "rateios" });
  const parcelasArr = useFieldArray({ control, name: "parcelas" });

  const inputAnexoRef = useRef<HTMLInputElement>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);

  const itens = watch("itens");
  const rateios = watch("rateios");
  const parcelas = watch("parcelas");
  const total = watch("total");
  const anexoUrl = watch("anexoUrl");
  const anexoNome = watch("anexoNome");
  const tipoDocumento = watch("tipoDocumento");
  const fornecedorId = watch("fornecedorId");
  const numero = watch("numero");
  const dataCompra = watch("dataCompra");
  const formaPagto = watch("formaPagto");
  const ehNF = exigeNumero(tipoDocumento);
  const situacaoPagas = situacaoParcelasPagas(parcelasExistentes, parcelas);

  function aoMudarTipoDocumento(novo: NotaFormValues["tipoDocumento"]) {
    const sugerido = tipoItemSugerido(novo);
    getValues("itens").forEach((item, i) => {
      if (!item.descricao.trim()) setValue(`itens.${i}.tipo`, sugerido);
    });
  }

  async function anexarArquivo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setEnviandoAnexo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const { erro } = await res.json().catch(() => ({ erro: null }));
        throw new Error(erro ?? "Falha no upload");
      }
      const { url } = await res.json();
      setValue("anexoUrl", url);
      setValue("anexoNome", file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar arquivo — verifique a conexão e tente de novo");
    } finally {
      setEnviandoAnexo(false);
      if (inputAnexoRef.current) inputAnexoRef.current.value = "";
    }
  }

  function aplicarMaterial(i: number, m: MaterialCatalogo | null) {
    setValue(`itens.${i}.materialId`, m?.id ?? "");
    if (!m) return;
    setValue(`itens.${i}.descricao`, m.nome, { shouldValidate: true });
    setValue(`itens.${i}.unidade`, m.unidade);
    setValue(`itens.${i}.tipo`, m.tipo);
    if (!getValues(`itens.${i}.unit`).trim()) {
      consultarPrecoSugerido(m.id, getValues("fornecedorId") || undefined)
        .then((cents) => {
          if (cents !== null && !getValues(`itens.${i}.unit`).trim()) setValue(`itens.${i}.unit`, centsParaEditavel(cents));
        })
        .catch(() => {});
    }
    setFocus(`itens.${i}.qtde`);
  }

  function selecionarFornecedor(f: FornecedorOption) {
    setFornecedores((prev) => [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome)));
    setValue("fornecedorId", f.id, { shouldValidate: true });
  }

  function cadastrarSugerido() {
    if (!fornecedorSugerido) return;
    startCadastroSugerido(async () => {
      const doc = fornecedorSugerido.documento;
      const res = await criarFornecedorInline(fornecedorSugerido.nome, doc ? formatarCnpj(doc) : undefined);
      if (res.ok && res.fornecedor) {
        toast.success("Fornecedor cadastrado");
        selecionarFornecedor(res.fornecedor);
      } else {
        toast.error(res.erro ?? "Erro ao cadastrar fornecedor");
      }
    });
  }

  function removerAnexo() {
    setValue("anexoUrl", "");
    setValue("anexoNome", "");
  }

  // sem useMemo: `watch("itens")` devolve o mesmo array mutado pelo RHF (a soma ficaria parada)
  const somaItensCents = somaItensForm(itens);
  const totalCents = moedaParaCents(total);
  const somaRateioBp = somaRateioForm(rateios);
  const somaParcelasCents = somaParcelasForm(parcelas, totalCents);

  const conferencia = linhasDeConferencia({
    totalCents,
    somaItensCents,
    somaRateioBp,
    parcelas: parcelas.length,
    somaParcelasCents,
  });
  const avisoItens = avisoItensDiferemDoTotal({ totalCents, somaItensCents });
  const [, linhaRateio, linhaParcelas] = conferencia;
  // erros que não são de um campo só: o servidor recusa do mesmo jeito (rateio ≠ 100%, parcelas ≠ total)
  const erroRateio =
    tentouSalvar && linhaRateio.situacao === "erro" ? `O rateio precisa somar 100%. ${linhaRateio.detalhe}.` : null;
  const erroParcelas = !tentouSalvar
    ? null
    : parcelas.length === 0
      ? "Gere as parcelas antes de salvar."
      : linhaParcelas.situacao === "erro"
        ? `As parcelas precisam somar o valor total. ${linhaParcelas.detalhe}.`
        : null;

  function gerarParcelasClick() {
    const v = getValues();
    const geradas = gerarParcelasForm({
      totalCents: moedaParaCents(v.total),
      numParcelas: v.numParcelas,
      formaPagto: v.formaPagto,
      dataCompra: v.dataCompra,
    });
    if (!geradas) {
      toast.error("Informe o valor total antes de gerar as parcelas");
      return;
    }
    setValue("parcelas", geradas);
  }

  function dividirIgualmenteClick() {
    const divididos = dividirIgualmenteForm(getValues("rateios"));
    if (!divididos) {
      toast.error("Adicione ao menos 2 obras ao rateio para dividir igualmente");
      return;
    }
    setValue("rateios", divididos);
  }

  function abrir(ids: SecaoId[]) {
    setSecoes((atuais) => [...new Set([...atuais, ...ids])]);
  }

  /** Abre a seção, leva a tela até ela e põe o foco no título (ou no que se pede). */
  function irParaSecao(id: SecaoId, foco?: () => HTMLElement | null) {
    abrir([id]);
    depoisDeAbrir(() => {
      const item = document.getElementById(`secao-${id}`);
      item?.scrollIntoView({ block: "start" });
      (foco?.() ?? item?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    });
  }

  function aoInvalidar(erros: FieldErrors<NotaFormValues>) {
    setTentouSalvar(true);
    abrir(secoesComErro(erros));
    depoisDeAbrir(() => {
      const campo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      campo?.scrollIntoView({ block: "center" });
      campo?.focus({ preventScroll: true });
    });
  }

  function aoValidar(v: NotaFormValues) {
    setTentouSalvar(true);
    const rateioFora = linhaRateio.situacao === "erro";
    const parcelasFora = parcelas.length === 0 || linhaParcelas.situacao === "erro";
    if (rateioFora || parcelasFora) {
      const secao: SecaoId = rateioFora ? "rateio" : "pagamento";
      irParaSecao(secao, () => document.getElementById(idDoErro(rateioFora ? "rateio" : "parcelas")));
      return;
    }
    enviar(v, false);
  }

  function enviar(v: NotaFormValues, forcar: boolean) {
    const payload = montarPayload(v, notaId, forcar);

    startTransition(async () => {
      const res = await salvarNota(payload);
      if (res.ok) {
        toast.success("Lançamento salvo");
        router.push("/notas");
        router.refresh();
      } else if (res.aviso) {
        setConfirmacao({ mensagem: res.erro ?? "", valores: v });
      } else {
        toast.error(res.erro ?? "Erro ao salvar");
      }
    });
  }

  const totalDeErros = Object.keys(errors).length + (erroRateio ? 1 : 0) + (erroParcelas ? 1 : 0);
  const status = enviandoAnexo
    ? "Enviando arquivo..."
    : pendente
      ? "Salvando..."
      : tentouSalvar && totalDeErros > 0
        ? "Corrija os campos marcados em vermelho."
        : "";

  // ---- resumo de cada seção (aparece com a seção fechada) ----
  const nomeFornecedor = fornecedores.find((f) => f.id === fornecedorId)?.nome;
  const resumoDocumento = [
    fornecedorId || numero ? [TIPO_DOCUMENTO_LABELS[tipoDocumento], numero].filter(Boolean).join(" ") : "",
    nomeFornecedor,
    dataCompra ? dataCurta(dataCompra) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const documentoCompleto = Boolean(fornecedorId && dataCompra && totalCents > 0 && (!ehNF || numero.trim()));
  const itensCompletos = itens.every((i) => i.descricao.trim() && i.unit.trim() && parseQtde(i.qtde) > 0);
  const nomesDasObras = rateios.map((r) => obras.find((o) => o.id === r.obraId)?.nome).filter(Boolean);
  const resumoRateio =
    nomesDasObras.length === 0
      ? ""
      : `${percentBpParaEditavel(somaRateioBp)}% · ${nomesDasObras.length === 1 ? nomesDasObras[0] : `${nomesDasObras.length} obras`}`;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(aoValidar, aoInvalidar)}
      noValidate
      className="space-y-4 pb-24 md:pb-0"
    >
      <ResumoLancamento
        total={formatarMoeda(totalCents)}
        linhas={conferencia}
        onIr={(id) => irParaSecao(SECAO_DA_LINHA[id] ?? "documento")}
      />

      <Accordion multiple value={secoes} onValueChange={(valor) => setSecoes(valor as SecaoId[])}>
        <AccordionItem value="documento" id="secao-documento" className="scroll-mt-56">
          <AccordionTrigger>
            <CabecalhoSecao
              compacto
              icone={FileText}
              titulo="Documento"
              resumo={
                errors.fornecedorId || errors.numero || errors.dataCompra || errors.total
                  ? "Corrija os campos"
                  : resumoDocumento || "Fornecedor, número, data e valor total"
              }
              preenchida={documentoCompleto}
              erro={Boolean(errors.fornecedorId || errors.numero || errors.dataCompra || errors.total)}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted className="sm:grid-cols-2 lg:grid-cols-4">
            <CampoForm
              id="tipoDocumento"
              rotulo="Tipo de documento"
              tituloAjuda="Tipo de documento"
              ajuda="Use Nota fiscal para compras com NF. Para mão de obra, diárias, impostos e taxas sem nota, escolha Recibo, Folha de pagamento, Guia/imposto ou Outro: o custo entra na obra do mesmo jeito."
            >
              <SelectNativo
                id="tipoDocumento"
                {...register("tipoDocumento", {
                  onChange: (e) => aoMudarTipoDocumento(e.target.value),
                })}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>{TIPO_DOCUMENTO_LABELS[t]}</option>
                ))}
              </SelectNativo>
            </CampoForm>

            <div className="grid content-start gap-1.5 sm:col-span-2">
              <CampoForm
                id="fornecedor"
                rotulo="Fornecedor"
                ajuda="Empresa ou pessoa que recebe o pagamento (em recibo ou folha, pode ser o próprio prestador). Busque por nome ou CNPJ; se ainda não existir, use o botão + ao lado para cadastrar na hora."
              >
                <div className="flex gap-2">
                  <Controller
                    control={control}
                    name="fornecedorId"
                    rules={{ required: "Selecione o fornecedor." }}
                    render={({ field, fieldState }) => (
                      <Combobox
                        id="fornecedor"
                        options={fornecedores.map((f) => ({
                          value: f.id,
                          label: f.nome,
                          descricao: f.cnpj ? formatarCnpj(f.cnpj) : null,
                        }))}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        erro={fieldState.invalid}
                        placeholder="Buscar por nome ou CNPJ..."
                        vazio="Nenhum fornecedor encontrado"
                        mensagemErro="Selecione o fornecedor."
                        aoSelecionar={(o) => o && toast.success(`Fornecedor selecionado: ${o.label}`)}
                      />
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Cadastrar novo fornecedor"
                    aria-label="Cadastrar novo fornecedor"
                    onClick={() => setDialogFornecedor(true)}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </CampoForm>
            </div>

            <CampoForm
              id="numero"
              rotulo={ehNF ? "Nº da NF" : "Nº do documento"}
              tituloAjuda={ehNF ? "Nº da NF (Nota Fiscal)" : "Nº do documento"}
              ajuda={
                ehNF
                  ? "Número impresso na nota fiscal. A combinação fornecedor + número não pode se repetir — evita lançar a mesma nota duas vezes."
                  : "Opcional. Se o documento tiver número (ex.: nº do recibo ou da guia), informe; se deixar em branco, o sistema gera um número em sequência para o fornecedor (ex.: REC-0001)."
              }
              erro={errors.numero?.message}
            >
              <Input
                id="numero"
                placeholder={ehNF ? undefined : "Automático"}
                {...atributosDoErro("numero", errors.numero?.message)}
                {...register("numero", {
                  validate: (v, valores) =>
                    !exigeNumero(valores.tipoDocumento) || v.trim() !== "" || "Informe o número da nota.",
                })}
              />
            </CampoForm>

            {fornecedorSugerido && !fornecedorId && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg sm:col-span-2 lg:col-span-4">
                <span className="min-w-0 flex-1">
                  Lido no documento: <b>{fornecedorSugerido.nome}</b>
                  {fornecedorSugerido.documento && ` · ${formatarCnpj(fornecedorSugerido.documento)}`} — ainda
                  não cadastrado.
                </span>
                <Button type="button" size="sm" disabled={cadastrandoSugerido} onClick={cadastrarSugerido}>
                  <Plus className="size-4" />
                  {cadastrandoSugerido ? "Cadastrando..." : "Cadastrar e usar"}
                </Button>
              </div>
            )}

            <CampoForm
              id="dataCompra"
              rotulo="Data"
              ajuda="Data de emissão do documento (ou do serviço). Serve de base para os relatórios por período e para calcular os vencimentos das parcelas."
              erro={errors.dataCompra?.message}
            >
              <Input
                id="dataCompra"
                type="date"
                {...atributosDoErro("dataCompra", errors.dataCompra?.message)}
                {...register("dataCompra", { required: "Informe a data." })}
              />
            </CampoForm>
            <CampoForm
              id="total"
              rotulo="Valor total (R$)"
              ajuda="Valor total do lançamento, em reais. A soma dos itens abaixo deve fechar com este valor (o sistema avisa se não bater)."
              erro={errors.total?.message}
            >
              <Input
                id="total"
                inputMode="decimal"
                placeholder="0,00"
                {...atributosDoErro("total", errors.total?.message)}
                {...register("total", {
                  validate: (v) =>
                    v.trim() === "" ? "Informe o valor total." : moedaParaCents(v) > 0 || "O valor total deve ser maior que zero.",
                })}
              />
            </CampoForm>
            <CampoForm
              id="obs"
              rotulo="Observações"
              ajuda="Anotações livres sobre o lançamento (ex.: pedido de compra, condição negociada, período da folha)."
              className="sm:col-span-2"
            >
              <Input id="obs" {...register("obs")} />
            </CampoForm>

            <div className="grid content-start gap-1.5 sm:col-span-2 lg:col-span-4">
              <Label>Arquivo do documento</Label>
              <input
                ref={inputAnexoRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => anexarArquivo(e.target.files)}
              />
              {anexoUrl ? (
                <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={anexoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-11 flex-1 truncate leading-[2.75rem] hover:underline pointer-fine:min-h-0 pointer-fine:leading-normal"
                  >
                    {anexoNome || "Ver arquivo anexado"}
                  </a>
                  <Button type="button" variant="ghost" size="sm" onClick={removerAnexo}>
                    <X className="size-4" /> Remover anexo
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={enviandoAnexo}
                  onClick={() => inputAnexoRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                  {enviandoAnexo ? "Enviando..." : "Anexar documento"}
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                PDF ou foto da nota, do recibo ou da guia. Ajuda a conferir depois, sem guardar o papel.
              </p>
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="itens" id="secao-itens" className="scroll-mt-56">
          <AccordionTrigger>
            <CabecalhoSecao
              compacto
              icone={Package}
              titulo="Itens"
              resumo={
                errors.itens
                  ? "Corrija os campos"
                  : `${itens.length} ${itens.length === 1 ? "item" : "itens"} · ${formatarMoeda(somaItensCents)}`
              }
              preenchida={itensCompletos && somaItensCents > 0}
              aviso={avisoItens !== null}
              erro={Boolean(errors.itens)}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <p className="text-sm text-muted-foreground">
              O que foi comprado ou pago, linha a linha. O subtotal é quantidade × unitário − desconto, e a soma
              deve fechar com o valor total.
            </p>
            {avisoItens && (
              <p
                role="status"
                className="rounded-md border border-estado-atencao-borda bg-estado-atencao p-3 text-sm font-medium text-estado-atencao-fg"
              >
                {avisoItens}
              </p>
            )}
            {itensArr.fields.map((field, i) => {
              const item = itens[i];
              const subtotal = item ? totalItemForm(item) : 0;
              const e = errors.itens?.[i];
              const id = (campo: string) => `item-${i}-${campo}`;
              return (
                <fieldset key={field.id} className="grid min-w-0 grid-cols-2 gap-3 rounded-xl border p-3 md:grid-cols-12">
                  <legend className="sr-only">Item {i + 1}</legend>
                  <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-12">
                    <p className="font-semibold [font-stretch:112%]">Item {i + 1}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="num text-lg">{formatarMoeda(subtotal)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={itensArr.fields.length === 1}
                        onClick={() => itensArr.remove(i)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" /> Remover
                      </Button>
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-12">
                    <CampoForm id={id("material")} rotulo="Material do catálogo (opcional)">
                      <div className="flex gap-2">
                        <Controller
                          control={control}
                          name={`itens.${i}.materialId`}
                          render={({ field }) => (
                            <Combobox
                              id={id("material")}
                              options={materiais.map((m) => ({
                                value: m.id,
                                label: m.nome,
                                descricao: [m.unidade, m.categoria].filter(Boolean).join(" · "),
                              }))}
                              value={field.value}
                              onChange={(mid) => aplicarMaterial(i, materiais.find((m) => m.id === mid) ?? null)}
                              onBlur={field.onBlur}
                              limparLabel="Item avulso (sem material do catálogo)"
                              placeholder="Escolher material do catálogo..."
                              vazio="Nenhum material encontrado"
                            />
                          )}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Cadastrar novo material"
                          aria-label="Cadastrar novo material"
                          onClick={() => setItemNovoMaterial(i)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </CampoForm>
                  </div>

                  <CampoForm id={id("descricao")} rotulo="Descrição" erro={e?.descricao?.message} className="col-span-2 md:col-span-8">
                    <Input
                      id={id("descricao")}
                      placeholder="CA50 8,00MM RETO 12M"
                      {...atributosDoErro(id("descricao"), e?.descricao?.message)}
                      {...register(`itens.${i}.descricao`, { required: "Descreva o item." })}
                    />
                  </CampoForm>
                  <CampoForm id={id("tipo")} rotulo="Tipo" className="col-span-2 md:col-span-4">
                    <SelectNativo id={id("tipo")} {...register(`itens.${i}.tipo`)}>
                      {TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </SelectNativo>
                  </CampoForm>
                  <CampoForm
                    id={id("qtde")}
                    rotulo={`Qtde${item?.materialId && item.unidade ? ` (${item.unidade})` : ""}`}
                    erro={e?.qtde?.message}
                    className="md:col-span-3"
                  >
                    <Input
                      id={id("qtde")}
                      inputMode="decimal"
                      {...atributosDoErro(id("qtde"), e?.qtde?.message)}
                      {...register(`itens.${i}.qtde`, {
                        validate: (v) => parseQtde(v) > 0 || "Informe a quantidade.",
                      })}
                    />
                  </CampoForm>
                  <CampoForm id={id("unidade")} rotulo="Unidade" erro={e?.unidade?.message} className="md:col-span-3">
                    <Input
                      id={id("unidade")}
                      list="unidades-item"
                      {...atributosDoErro(id("unidade"), e?.unidade?.message)}
                      {...register(`itens.${i}.unidade`, { required: "Informe a unidade." })}
                    />
                  </CampoForm>
                  <CampoForm id={id("unit")} rotulo="Unitário (R$)" erro={e?.unit?.message} className="md:col-span-3">
                    <Input
                      id={id("unit")}
                      inputMode="decimal"
                      placeholder="0,00"
                      {...atributosDoErro(id("unit"), e?.unit?.message)}
                      {...register(`itens.${i}.unit`, { required: "Informe o preço unitário." })}
                    />
                  </CampoForm>
                  <CampoForm id={id("desconto")} rotulo="Desconto (R$)" className="md:col-span-3">
                    <Input id={id("desconto")} inputMode="decimal" placeholder="0,00" {...register(`itens.${i}.desconto`)} />
                  </CampoForm>
                </fieldset>
              );
            })}
            <Button type="button" variant="outline" className="w-fit" onClick={() => itensArr.append(ITEM_VAZIO)}>
              <Plus className="size-4" /> Adicionar item
            </Button>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="rateio" id="secao-rateio" className="scroll-mt-56">
          <AccordionTrigger>
            <CabecalhoSecao
              compacto
              icone={Percent}
              titulo="Rateio entre obras"
              resumo={resumoRateio || "Escolha a obra"}
              preenchida={somaRateioBp === BP_TOTAL && rateios.every((r) => r.obraId)}
              erro={Boolean(errors.rateios || erroRateio)}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <p className="text-sm text-muted-foreground">
              Divide o valor entre uma ou mais obras, em percentual. A soma precisa fechar 100%. Informe a etapa
              se o custo for de um estágio específico.
            </p>
            {rateiosArr.fields.map((field, i) => {
              const obraSelecionada = obras.find((o) => o.id === rateios[i]?.obraId);
              const e = errors.rateios?.[i];
              const id = (campo: string) => `rateio-${i}-${campo}`;
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 items-start gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_8rem_auto]"
                >
                  <CampoForm id={id("obra")} rotulo="Obra" className="col-span-2 md:col-span-1">
                    <Controller
                      control={control}
                      name={`rateios.${i}.obraId`}
                      rules={{ required: "Selecione a obra." }}
                      render={({ field, fieldState }) => (
                        <Combobox
                          id={id("obra")}
                          options={obras.map((o) => ({ value: o.id, label: o.nome }))}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          erro={fieldState.invalid}
                          placeholder="Escolher obra..."
                          vazio="Nenhuma obra encontrada"
                          mensagemErro="Selecione a obra."
                        />
                      )}
                    />
                  </CampoForm>
                  <CampoForm id={id("etapa")} rotulo="Etapa (opcional)" className="col-span-2 md:col-span-1">
                    <SelectNativo id={id("etapa")} {...register(`rateios.${i}.etapaId`)}>
                      <option value="">Sem etapa</option>
                      {obraSelecionada?.etapas.map((et) => (
                        <option key={et.id} value={et.id}>{et.nome}</option>
                      ))}
                    </SelectNativo>
                  </CampoForm>
                  <CampoForm id={id("percent")} rotulo="Percentual (%)" erro={e?.percent?.message}>
                    <Input
                      id={id("percent")}
                      inputMode="decimal"
                      placeholder="100"
                      {...atributosDoErro(id("percent"), e?.percent?.message)}
                      {...register(`rateios.${i}.percent`, { required: "Informe o percentual." })}
                    />
                  </CampoForm>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-end md:mt-7"
                    disabled={rateiosArr.fields.length === 1}
                    onClick={() => rateiosArr.remove(i)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" /> Remover
                  </Button>
                </div>
              );
            })}
            {erroRateio && (
              <MensagemErro id="rateio" focavel>
                {erroRateio}
              </MensagemErro>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => rateiosArr.append({ obraId: "", etapaId: "", percent: "" })}
              >
                <Plus className="size-4" /> Adicionar obra
              </Button>
              <Button type="button" variant="outline" onClick={dividirIgualmenteClick}>
                <Wand2 className="size-4" /> Dividir igualmente
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              O rateio vale para todos os itens. Para mandar um item a outra obra, lance-o separado.
            </p>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="pagamento" id="secao-pagamento" className="scroll-mt-56">
          <AccordionTrigger>
            <CabecalhoSecao
              compacto
              icone={Wallet}
              titulo="Pagamento"
              resumo={
                parcelas.length === 0
                  ? "Falta gerar as parcelas"
                  : `${FORMA_PAGTO_LABELS[formaPagto]} · ${parcelas.length}x · ${formatarMoeda(somaParcelasCents)}`
              }
              preenchida={parcelas.length > 0 && linhaParcelas.situacao === "ok"}
              erro={Boolean(errors.parcelas || erroParcelas)}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <p className="text-sm text-muted-foreground">
              Escolha a forma e o número de parcelas e gere os vencimentos. Depois ajuste valor e data de cada
              uma. Parcelas já pagas continuam pagas se o valor e o vencimento não mudarem.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <CampoForm id="formaPagto" rotulo="Forma de pagamento" className="w-44">
                <SelectNativo id="formaPagto" {...register("formaPagto")}>
                  {FORMAS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </SelectNativo>
              </CampoForm>
              <CampoForm id="numParcelas" rotulo="Parcelas" className="w-24">
                <SelectNativo id="numParcelas" {...register("numParcelas")}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </SelectNativo>
              </CampoForm>
              <Button type="button" variant="secondary" onClick={gerarParcelasClick}>
                <Wand2 className="size-4" /> Gerar parcelas
              </Button>
            </div>

            {parcelasArr.fields.map((field, i) => {
              const situacao = situacaoPagas.porNumero.get(parcelas[i]?.numero ?? field.numero);
              const e = errors.parcelas?.[i];
              const id = (campo: string) => `parcela-${i}-${campo}`;
              return (
                <div key={field.id} className="grid grid-cols-2 items-start gap-3 rounded-xl border p-3 sm:grid-cols-[6rem_1fr_1fr_auto]">
                  <p className="col-span-2 flex items-center gap-2 font-semibold [font-stretch:112%] sm:col-span-1 sm:mt-8">
                    {i + 1}ª parcela
                  </p>
                  <CampoForm id={id("valor")} rotulo="Valor (R$)" erro={e?.valor?.message}>
                    <Input
                      id={id("valor")}
                      inputMode="decimal"
                      placeholder="0,00"
                      {...atributosDoErro(id("valor"), e?.valor?.message)}
                      {...register(`parcelas.${i}.valor`, { required: "Informe o valor da parcela." })}
                    />
                  </CampoForm>
                  <CampoForm id={id("vencimento")} rotulo="Vencimento" erro={e?.vencimento?.message}>
                    <Input
                      id={id("vencimento")}
                      type="date"
                      {...atributosDoErro(id("vencimento"), e?.vencimento?.message)}
                      {...register(`parcelas.${i}.vencimento`, { required: "Informe o vencimento." })}
                    />
                  </CampoForm>
                  {situacao && (
                    <span className="col-span-2 sm:col-span-1 sm:mt-8">
                      {situacao === "paga" ? (
                        <StatusBadge estado="pago">Paga</StatusBadge>
                      ) : (
                        <StatusBadge estado="atencao">Paga · volta a abrir</StatusBadge>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
            {situacaoPagas.pagasRemovidas.length > 0 && (
              <p role="status" className="text-sm font-medium text-estado-atencao-fg">
                Parcela(s) paga(s) removida(s): {situacaoPagas.pagasRemovidas.map((n) => `${n}ª`).join(", ")}.
                O registro do pagamento será perdido ao salvar.
              </p>
            )}
            {erroParcelas && (
              <MensagemErro id="parcelas" focavel>
                {erroParcelas}
              </MensagemErro>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {/* no celular a barra fixa fica só com a ação principal; cancelar sobe para o fim do formulário */}
      <Button type="button" variant="ghost" className="w-full md:hidden" onClick={() => router.back()}>
        Cancelar
      </Button>

      <BarraDeAcao>
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "min-w-0 flex-1 text-sm leading-snug sr-only md:not-sr-only",
            status.startsWith("Corrija") ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {status}
        </p>
        <Button type="button" variant="outline" className="hidden md:inline-flex" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 md:flex-none" disabled={pendente || enviandoAnexo}>
          {pendente ? "Salvando..." : notaId ? "Salvar alterações" : "Salvar lançamento"}
        </Button>
      </BarraDeAcao>

      <datalist id="unidades-item">
        {UNIDADES_PADRAO.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <ConfirmarDialog
        aberto={confirmacao !== null}
        onAbertoChange={(aberto) => !aberto && setConfirmacao(null)}
        titulo="Salvar mesmo assim?"
        confirmar="Salvar mesmo assim"
        voltar="Voltar e ajustar"
        onConfirmar={() => {
          const v = confirmacao?.valores;
          setConfirmacao(null);
          if (v) enviar(v, true);
        }}
      >
        <p className="text-base whitespace-pre-line">
          {(confirmacao?.mensagem ?? "").replace(/\s*Salvar mesmo assim\?\s*$/, "")}
        </p>
      </ConfirmarDialog>

      <Dialog open={itemNovoMaterial !== null} onOpenChange={(aberto) => !aberto && setItemNovoMaterial(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo material</DialogTitle>
          </DialogHeader>
          <NovoMaterialInline
            nomeInicial={itemNovoMaterial !== null ? (itens[itemNovoMaterial]?.descricao ?? "") : ""}
            unidadeInicial={itemNovoMaterial !== null ? (itens[itemNovoMaterial]?.unidade ?? "PC") : "PC"}
            onCriado={(m) => {
              setMateriais((prev) => [...prev, m].sort((a, b) => a.nome.localeCompare(b.nome)));
              if (itemNovoMaterial !== null) aplicarMaterial(itemNovoMaterial, m);
              setItemNovoMaterial(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialogFornecedor} onOpenChange={setDialogFornecedor}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo fornecedor</DialogTitle>
          </DialogHeader>
          <NovoFornecedorInline
            nomeInicial={fornecedorSugerido?.nome}
            cnpjInicial={fornecedorSugerido?.documento ? formatarCnpj(fornecedorSugerido.documento) : undefined}
            onCriado={(f) => {
              selecionarFornecedor(f);
              setDialogFornecedor(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </form>
  );
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function NovoFornecedorInline({
  onCriado,
  nomeInicial = "",
  cnpjInicial = "",
}: {
  onCriado: (f: FornecedorOption) => void;
  nomeInicial?: string;
  cnpjInicial?: string;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [cnpj, setCnpj] = useState(cnpjInicial);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Nome *</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>CNPJ</Label>
        <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
      </div>
      <Button
        type="button"
        disabled={pendente || !nome.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await criarFornecedorInline(nome, cnpj || undefined);
            if (res.ok && res.fornecedor) {
              toast.success("Fornecedor criado");
              onCriado(res.fornecedor);
            } else {
              toast.error(res.erro ?? "Erro ao criar fornecedor");
            }
          })
        }
      >
        {pendente ? "Criando..." : "Criar fornecedor"}
      </Button>
    </div>
  );
}

function NovoMaterialInline({
  onCriado,
  nomeInicial = "",
  unidadeInicial = "PC",
}: {
  onCriado: (m: MaterialCatalogo) => void;
  nomeInicial?: string;
  unidadeInicial?: string;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [unidade, setUnidade] = useState(unidadeInicial);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Nome do material *</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>Unidade *</Label>
        <Input value={unidade} list="unidades-item" onChange={(e) => setUnidade(e.target.value)} />
      </div>
      <Button
        type="button"
        disabled={pendente || !nome.trim() || !unidade.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await criarMaterialInline({ nome, unidade });
            if (res.ok && res.material) {
              toast.success("Material cadastrado");
              onCriado(res.material);
            } else {
              toast.error(res.erro ?? "Erro ao cadastrar material");
            }
          })
        }
      >
        {pendente ? "Cadastrando..." : "Cadastrar e usar"}
      </Button>
    </div>
  );
}
