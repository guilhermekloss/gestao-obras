"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectNativo } from "@/components/select-nativo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarMoeda, moedaParaCents } from "@/lib/format";
import { gerarParcelas } from "@/services/parcelas";
import { dividirIgualmente, calcularTotalItem, BP_TOTAL } from "@/services/rateio";
import { salvarNota, criarFornecedorInline } from "./actions";
import type { NotaInput } from "@/schemas/nota";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Wand2, ChevronsUpDown, Check } from "lucide-react";

export type FornecedorOption = { id: string; nome: string; cnpj?: string | null };
export type ObraOption = {
  id: string;
  nome: string;
  etapas: { id: string; nome: string }[];
};

type ItemForm = {
  descricao: string;
  tipo: "MATERIAL" | "SERVICO" | "FRETE" | "ENCARGO";
  qtde: string;
  unidade: string;
  unit: string; // moeda BR
  desconto: string; // moeda BR
};

type RateioForm = { obraId: string; etapaId: string; percent: string };
type ParcelaForm = { numero: number; valor: string; vencimento: string };

type NotaFormValues = {
  fornecedorId: string;
  numero: string;
  dataCompra: string;
  total: string; // moeda BR
  formaPagto: "PIX" | "CARTAO" | "DEBITO" | "BOLETO";
  numParcelas: string;
  obs: string;
  itens: ItemForm[];
  rateios: RateioForm[];
  parcelas: ParcelaForm[];
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

function parseQtde(s: string): number {
  return parseFloat(s.replace(",", ".")) || 0;
}

function percentParaBp(s: string): number {
  return Math.round((parseFloat(s.replace(",", ".")) || 0) * 100);
}

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
        dataCompra: new Date().toISOString().slice(0, 10),
        total: "",
        formaPagto: "PIX",
        numParcelas: "1",
        obs: "",
        itens: [ITEM_VAZIO],
        rateios: [{ obraId: obras[0]?.id ?? "", etapaId: "", percent: "100" }],
        parcelas: [],
        ...defaultValues,
      },
    });

  const itensArr = useFieldArray({ control, name: "itens" });
  const rateiosArr = useFieldArray({ control, name: "rateios" });
  const parcelasArr = useFieldArray({ control, name: "parcelas" });

  const itens = watch("itens");
  const rateios = watch("rateios");
  const parcelas = watch("parcelas");
  const total = watch("total");

  const somaItensCents = useMemo(
    () =>
      itens.reduce(
        (acc, i) =>
          acc +
          calcularTotalItem(parseQtde(i.qtde), moedaParaCents(i.unit), moedaParaCents(i.desconto)),
        0,
      ),
    [itens],
  );
  const totalCents = moedaParaCents(total);
  const somaRateioBp = rateios.reduce((acc, r) => acc + percentParaBp(r.percent), 0);
  const somaParcelasCents = parcelas.reduce((acc, p) => acc + moedaParaCents(p.valor), 0);

  function gerarParcelasClick() {
    const v = getValues();
    const tc = moedaParaCents(v.total);
    if (tc <= 0) {
      toast.error("Informe o valor total da nota antes de gerar as parcelas");
      return;
    }
    const geradas = gerarParcelas({
      totalCents: tc,
      numParcelas: Math.max(1, parseInt(v.numParcelas) || 1),
      formaPagto: v.formaPagto,
      dataCompra: new Date(v.dataCompra + "T12:00:00"),
    });
    setValue(
      "parcelas",
      geradas.map((p) => ({
        numero: p.numero,
        valor: (p.valorCents / 100).toFixed(2).replace(".", ","),
        vencimento: p.vencimento.toISOString().slice(0, 10),
      })),
    );
  }

  function dividirIgualmenteClick() {
    const atual = getValues("rateios");
    if (atual.length < 2) {
      toast.error("Adicione ao menos 2 obras ao rateio para dividir igualmente");
      return;
    }
    const bps = dividirIgualmente(atual.length);
    setValue(
      "rateios",
      atual.map((r, i) => ({ ...r, percent: (bps[i] / 100).toFixed(2).replace(".", ",") })),
    );
  }

  function onSubmit(v: NotaFormValues, forcar = false) {
    const payload: NotaInput = {
      id: notaId,
      fornecedorId: v.fornecedorId,
      numero: v.numero,
      dataCompra: v.dataCompra,
      totalCents: moedaParaCents(v.total),
      formaPagto: v.formaPagto,
      obs: v.obs || undefined,
      itens: v.itens.map((i) => ({
        descricao: i.descricao,
        tipo: i.tipo,
        qtde: parseQtde(i.qtde),
        unidade: i.unidade,
        unitCents: moedaParaCents(i.unit),
        descontoCents: moedaParaCents(i.desconto),
      })),
      rateios: v.rateios.map((r) => ({
        obraId: r.obraId,
        etapaId: r.etapaId || undefined,
        fracaoBp: percentParaBp(r.percent),
      })),
      parcelas: v.parcelas.map((p) => ({
        numero: p.numero,
        valorCents: moedaParaCents(p.valor),
        vencimento: p.vencimento,
      })),
      forcar,
    };

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
            <Label>Fornecedor *</Label>
            <div className="flex gap-2">
              <Controller
                control={control}
                name="fornecedorId"
                rules={{ required: true }}
                render={({ field }) => (
                  <FornecedorCombobox
                    fornecedores={fornecedores}
                    value={field.value}
                    onChange={field.onChange}
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
            <Label htmlFor="numero">Nº da NF *</Label>
            <Input id="numero" {...register("numero", { required: true })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dataCompra">Data da compra *</Label>
            <Input id="dataCompra" type="date" {...register("dataCompra", { required: true })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="total">Valor total (R$) *</Label>
            <Input id="total" inputMode="decimal" placeholder="0,00" {...register("total", { required: true })} />
          </div>
          <div className="grid gap-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="obs">Observações</Label>
            <Input id="obs" {...register("obs")} />
          </div>
        </CardContent>
      </Card>

      {/* Itens */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Itens</CardTitle>
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
            const subtotal = item
              ? calcularTotalItem(parseQtde(item.qtde), moedaParaCents(item.unit), moedaParaCents(item.desconto))
              : 0;
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
          <CardTitle>Rateio entre obras</CardTitle>
          <span
            className={
              somaRateioBp === BP_TOTAL
                ? "text-sm text-green-600"
                : "text-sm font-medium text-destructive"
            }
          >
            {(somaRateioBp / 100).toFixed(2).replace(".", ",")}% de 100%
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {rateiosArr.fields.map((field, i) => {
            const obraSelecionada = obras.find((o) => o.id === rateios[i]?.obraId);
            return (
              <div key={field.id} className="grid grid-cols-[1fr_90px_36px] gap-2 md:grid-cols-[1fr_1fr_110px_36px]">
                <SelectNativo {...register(`rateios.${i}.obraId`, { required: true })}>
                  <option value="">Obra...</option>
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>{o.nome}</option>
                  ))}
                </SelectNativo>
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
          <CardTitle>Pagamento</CardTitle>
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
        <Button type="submit" disabled={pendente}>
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

/** Remove acentos e normaliza para busca insensível a maiúsculas/acentos. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** Campo de fornecedor com busca dinâmica por nome ou CNPJ. */
function FornecedorCombobox({
  fornecedores,
  value,
  onChange,
}: {
  fornecedores: FornecedorOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selecionado = fornecedores.find((f) => f.id === value) ?? null;

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    const digitos = busca.replace(/\D/g, "");
    if (!termo) return fornecedores.slice(0, 50);
    return fornecedores
      .filter((f) => {
        const nomeMatch = normalizar(f.nome).includes(termo);
        const cnpjMatch =
          digitos.length > 0 && !!f.cnpj && f.cnpj.replace(/\D/g, "").includes(digitos);
        return nomeMatch || cnpjMatch;
      })
      .slice(0, 50);
  }, [busca, fornecedores]);

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function buscar(texto: string) {
    setBusca(texto);
    setDestaque(0);
    setAberto(true);
  }

  function selecionar(f: FornecedorOption) {
    onChange(f.id);
    setAberto(false);
    setBusca("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto && (e.key === "ArrowDown" || e.key === "Enter")) {
      setAberto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const f = filtrados[destaque];
      if (f) selecionar(f);
    } else if (e.key === "Escape") {
      setAberto(false);
      setBusca("");
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Campo oculto para validação nativa de "required" */}
      <input
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute size-0 opacity-0"
        value={value}
        required
        onChange={() => {}}
      />
      <div className="relative">
        <Input
          ref={inputRef}
          value={aberto ? busca : selecionado?.nome ?? ""}
          placeholder="Buscar por nome ou CNPJ..."
          onFocus={() => {
            setAberto(true);
            setBusca("");
          }}
          onChange={(e) => buscar(e.target.value)}
          onKeyDown={onKeyDown}
          className="pr-8"
          autoComplete="off"
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {aberto && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {filtrados.length === 0 ? (
            <li className="px-2 py-2 text-muted-foreground">Nenhum fornecedor encontrado</li>
          ) : (
            filtrados.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  onMouseEnter={() => setDestaque(i)}
                  onMouseDown={(e) => {
                    // evita blur do input antes do clique
                    e.preventDefault();
                    selecionar(f);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left",
                    i === destaque && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    className={cn("size-4 shrink-0", f.id === value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{f.nome}</span>
                    {f.cnpj && (
                      <span className="truncate text-xs text-muted-foreground">
                        {formatarCnpj(f.cnpj)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
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
