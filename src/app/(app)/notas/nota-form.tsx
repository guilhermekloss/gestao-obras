"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectNativo } from "@/components/select-nativo";
import { Combobox } from "@/components/combobox";
import { LabelAjuda, CampoAjuda } from "@/components/campo-ajuda";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarMoeda, moedaParaCents, dataParaInput, percentBpParaEditavel } from "@/lib/format";
import { BP_TOTAL } from "@/services/rateio";
import { salvarNota, criarFornecedorInline } from "./actions";
import {
  dividirIgualmenteForm,
  gerarParcelasForm,
  montarPayload,
  somaItensForm,
  somaParcelasForm,
  somaRateioForm,
  totalItemForm,
  type ItemForm,
  type NotaFormValues,
} from "./nota-form-model";
import { Paperclip, Plus, Trash2, Wand2, X } from "lucide-react";

export type FornecedorOption = { id: string; nome: string; cnpj?: string | null };
export type ObraOption = {
  id: string;
  nome: string;
  etapas: { id: string; nome: string }[];
};

const ITEM_VAZIO: ItemForm = {
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

const FORMAS = [
  { value: "PIX", label: "PIX" },
  { value: "CARTAO", label: "Cartão" },
  { value: "DEBITO", label: "Débito" },
  { value: "BOLETO", label: "Boleto" },
];

export function NotaForm({
  fornecedores: fornecedoresIniciais,
  obras,
  defaultValues,
  notaId,
}: {
  fornecedores: FornecedorOption[];
  obras: ObraOption[];
  defaultValues?: Partial<NotaFormValues>;
  notaId?: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [dialogFornecedor, setDialogFornecedor] = useState(false);

  const { register, control, handleSubmit, watch, setValue, getValues } =
    useForm<NotaFormValues>({
      defaultValues: {
        fornecedorId: "",
        numero: "",
        dataCompra: dataParaInput(new Date()),
        total: "",
        formaPagto: "PIX",
        numParcelas: "1",
        obs: "",
        anexoUrl: "",
        anexoNome: "",
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

  function removerAnexo() {
    setValue("anexoUrl", "");
    setValue("anexoNome", "");
  }

  const somaItensCents = useMemo(() => somaItensForm(itens), [itens]);
  const totalCents = moedaParaCents(total);
  const somaRateioBp = somaRateioForm(rateios);
  const somaParcelasCents = somaParcelasForm(parcelas, totalCents);

  function gerarParcelasClick() {
    const v = getValues();
    const geradas = gerarParcelasForm({
      totalCents: moedaParaCents(v.total),
      numParcelas: v.numParcelas,
      formaPagto: v.formaPagto,
      dataCompra: v.dataCompra,
    });
    if (!geradas) {
      toast.error("Informe o valor total da nota antes de gerar as parcelas");
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

  function onSubmit(v: NotaFormValues, forcar = false) {
    const payload = montarPayload(v, notaId, forcar);

    startTransition(async () => {
      const res = await salvarNota(payload);
      if (res.ok) {
        toast.success("Nota fiscal salva");
        router.push("/notas");
        router.refresh();
      } else if (res.aviso) {
        if (confirm(res.erro)) onSubmit(v, true);
      } else {
        toast.error(res.erro ?? "Erro ao salvar");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v))} className="space-y-6">
      {/* Cabeçalho */}
      <Card>
        <CardHeader>
          <CardTitle>Dados da nota</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2 sm:col-span-2">
            <LabelAjuda ajuda="Empresa ou pessoa que emitiu a nota. Busque por nome ou CNPJ; se ainda não existir, use o botão + ao lado para cadastrar na hora.">
              Fornecedor *
            </LabelAjuda>
            <div className="flex gap-2">
              <Controller
                control={control}
                name="fornecedorId"
                rules={{ required: true }}
                render={({ field, fieldState }) => (
                  <Combobox
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
                    mensagemErro="Selecione um fornecedor"
                    aoSelecionar={(o) =>
                      o && toast.success(`Fornecedor selecionado: ${o.label}`)
                    }
                  />
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Novo fornecedor"
                onClick={() => setDialogFornecedor(true)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <LabelAjuda
              htmlFor="numero"
              titulo="Nº da NF (Nota Fiscal)"
              ajuda="Número impresso na nota fiscal. A combinação fornecedor + número não pode se repetir — evita lançar a mesma nota duas vezes."
            >
              Nº da NF *
            </LabelAjuda>
            <Input id="numero" {...register("numero", { required: true })} />
          </div>
          <div className="grid gap-2">
            <LabelAjuda htmlFor="dataCompra" ajuda="Data de emissão da nota. Serve de base para os relatórios por período e para calcular os vencimentos das parcelas.">
              Data da compra *
            </LabelAjuda>
            <Input id="dataCompra" type="date" {...register("dataCompra", { required: true })} />
          </div>
          <div className="grid gap-2">
            <LabelAjuda htmlFor="total" ajuda="Valor total da nota, em reais. A soma dos itens abaixo deve fechar com este valor (o sistema avisa se não bater).">
              Valor total (R$) *
            </LabelAjuda>
            <Input id="total" inputMode="decimal" placeholder="0,00" {...register("total", { required: true })} />
          </div>
          <div className="grid gap-2 sm:col-span-2 lg:col-span-3">
            <LabelAjuda htmlFor="obs" ajuda="Anotações livres sobre a nota (ex.: pedido de compra, condição negociada).">
              Observações
            </LabelAjuda>
            <Input id="obs" {...register("obs")} />
          </div>
          <div className="grid gap-2 sm:col-span-2 lg:col-span-4">
            <LabelAjuda ajuda="Anexe o arquivo da nota fiscal (PDF ou foto do documento). Ajuda a conferir a compra depois, sem precisar guardar o papel.">
              Arquivo da nota
            </LabelAjuda>
            <input
              ref={inputAnexoRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => anexarArquivo(e.target.files)}
            />
            {anexoUrl ? (
              <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <a
                  href={anexoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  {anexoNome || "Ver arquivo anexado"}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7"
                  onClick={removerAnexo}
                  title="Remover anexo"
                >
                  <X className="size-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={enviandoAnexo}
                onClick={() => inputAnexoRef.current?.click()}
              >
                <Paperclip className="size-4" />
                {enviandoAnexo ? "Enviando..." : "Anexar nota fiscal"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Itens */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            Itens
            <CampoAjuda titulo="Itens da nota">
              Detalhe o que foi comprado, linha a linha. Colunas: <b>Tipo</b> (Material,
              Serviço, Frete ou Encargo — classifica o custo nos relatórios); <b>Qtde</b> e{" "}
              <b>Und</b> (quantidade e unidade, ex.: 10 SC, 2 M³); <b>Unitário</b> (preço de
              uma unidade) e <b>Desconto</b> (abatimento em R$). O subtotal é calculado
              automaticamente, e a soma dos itens deve fechar com o valor total da nota.
            </CampoAjuda>
          </CardTitle>
          <span
            className={
              totalCents > 0 && somaItensCents !== totalCents
                ? "text-sm font-medium text-amber-600"
                : "text-sm text-muted-foreground"
            }
          >
            Soma dos itens: {formatarMoeda(somaItensCents)}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {itensArr.fields.map((field, i) => {
            const item = itens[i];
            const subtotal = item ? totalItemForm(item) : 0;
            return (
              <div key={field.id} className="grid grid-cols-2 gap-2 rounded-md border p-3 md:grid-cols-[1fr_110px_80px_70px_110px_110px_100px_36px] md:items-end">
                <div className="col-span-2 grid gap-1 md:col-span-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input {...register(`itens.${i}.descricao`, { required: true })} placeholder="CA50 8,00MM RETO 12M" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Tipo</Label>
                  <SelectNativo {...register(`itens.${i}.tipo`)}>
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </SelectNativo>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Qtde</Label>
                  <Input inputMode="decimal" {...register(`itens.${i}.qtde`, { required: true })} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Und</Label>
                  <Input {...register(`itens.${i}.unidade`, { required: true })} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Unitário (R$)</Label>
                  <Input inputMode="decimal" placeholder="0,00" {...register(`itens.${i}.unit`, { required: true })} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Desconto (R$)</Label>
                  <Input inputMode="decimal" placeholder="0,00" {...register(`itens.${i}.desconto`)} />
                </div>
                <div className="pb-2 text-right text-sm font-medium md:pb-2">
                  {formatarMoeda(subtotal)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={itensArr.fields.length === 1}
                  onClick={() => itensArr.remove(i)}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => itensArr.append(ITEM_VAZIO)}>
            <Plus className="size-4" /> Adicionar item
          </Button>
        </CardContent>
      </Card>

      {/* Rateio */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            Rateio entre obras
            <CampoAjuda titulo="Rateio entre obras">
              Distribui o valor desta nota entre uma ou mais obras, em percentual. A soma
              precisa fechar <b>100%</b> (o indicador ao lado fica verde quando bate). Informe
              a <b>etapa</b> se quiser lançar o custo num estágio específico da obra. Use{" "}
              <b>Dividir igualmente</b> para repartir automaticamente entre as obras
              adicionadas.
            </CampoAjuda>
          </CardTitle>
          <span
            className={
              somaRateioBp === BP_TOTAL
                ? "text-sm text-green-600"
                : "text-sm font-medium text-destructive"
            }
          >
            {percentBpParaEditavel(somaRateioBp)}% de 100%
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {rateiosArr.fields.map((field, i) => {
            const obraSelecionada = obras.find((o) => o.id === rateios[i]?.obraId);
            return (
              <div key={field.id} className="grid grid-cols-[1fr_90px_36px] gap-2 md:grid-cols-[1fr_1fr_110px_36px]">
                <Controller
                  control={control}
                  name={`rateios.${i}.obraId`}
                  rules={{ required: true }}
                  render={({ field, fieldState }) => (
                    <Combobox
                      options={obras.map((o) => ({ value: o.id, label: o.nome }))}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      erro={fieldState.invalid}
                      placeholder="Obra..."
                      vazio="Nenhuma obra encontrada"
                      mensagemErro="Selecione a obra"
                    />
                  )}
                />
                <SelectNativo {...register(`rateios.${i}.etapaId`)} className="hidden md:block">
                  <option value="">Etapa (opcional)</option>
                  {obraSelecionada?.etapas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </SelectNativo>
                <Input
                  inputMode="decimal"
                  placeholder="%"
                  {...register(`rateios.${i}.percent`, { required: true })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rateiosArr.fields.length === 1}
                  onClick={() => rateiosArr.remove(i)}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rateiosArr.append({ obraId: "", etapaId: "", percent: "" })}
            >
              <Plus className="size-4" /> Obra
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={dividirIgualmenteClick}>
              <Wand2 className="size-4" /> Dividir igualmente
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O rateio se aplica a todos os itens da nota. Para destinar um item específico a outra obra, lance-o em uma nota separada ou divida em linhas.
          </p>
        </CardContent>
      </Card>

      {/* Pagamento */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            Pagamento
            <CampoAjuda titulo="Pagamento">
              Escolha a <b>forma</b> (PIX, Cartão, Débito ou Boleto) e o número de{" "}
              <b>parcelas</b>. Depois clique em <b>Gerar parcelas</b> para o sistema criar os
              vencimentos automaticamente — você ainda pode ajustar cada valor e data. A soma
              das parcelas deve fechar com o valor total da nota.
            </CampoAjuda>
          </CardTitle>
          <span
            className={
              parcelas.length > 0 && somaParcelasCents !== totalCents
                ? "text-sm font-medium text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            Soma das parcelas: {formatarMoeda(somaParcelasCents)}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Forma</Label>
              <SelectNativo {...register("formaPagto")} className="w-32">
                {FORMAS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </SelectNativo>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Parcelas</Label>
              <SelectNativo {...register("numParcelas")} className="w-20">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </SelectNativo>
            </div>
            <Button type="button" variant="secondary" onClick={gerarParcelasClick}>
              <Wand2 className="size-4" /> Gerar parcelas
            </Button>
          </div>

          {parcelasArr.fields.length > 0 && (
            <div className="space-y-2">
              {parcelasArr.fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-[40px_1fr_1fr] items-center gap-2">
                  <span className="text-sm text-muted-foreground">{i + 1}ª</span>
                  <Input inputMode="decimal" placeholder="Valor" {...register(`parcelas.${i}.valor`, { required: true })} />
                  <Input type="date" {...register(`parcelas.${i}.vencimento`, { required: true })} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente || enviandoAnexo}>
          {pendente ? "Salvando..." : notaId ? "Salvar alterações" : "Lançar nota"}
        </Button>
      </div>

      {/* Fornecedor inline */}
      <Dialog open={dialogFornecedor} onOpenChange={setDialogFornecedor}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo fornecedor</DialogTitle>
          </DialogHeader>
          <NovoFornecedorInline
            onCriado={(f) => {
              setFornecedores((prev) => [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome)));
              setValue("fornecedorId", f.id);
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
}: {
  onCriado: (f: FornecedorOption) => void;
}) {
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
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
