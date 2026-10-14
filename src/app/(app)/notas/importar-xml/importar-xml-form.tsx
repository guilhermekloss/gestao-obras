"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { TipoItem } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { SelectNativo } from "@/components/select-nativo";
import { CampoAjuda } from "@/components/campo-ajuda";
import {
  centsParaEditavel,
  formatarMoeda,
  moedaParaCents,
  percentBpParaEditavel,
  percentEditavelParaBp,
} from "@/lib/format";
import { BP_TOTAL, dividirIgualmente, validarRateio } from "@/services/rateio";
import { validarParcelas } from "@/services/parcelas";
import { parcelasDaNfe, parseNfeXml, type Nfe } from "@/services/nfe-xml";
import { consultarSituacaoImportacao, importarNfe, type SituacaoImportacao } from "./actions";
import { AvisoNotaExistente, PreviaCabecalho, PreviaItens, formatarDataXml } from "./previa-nfe";
import { AlertTriangle, FileCode2, Plus, Trash2, Upload, Wand2 } from "lucide-react";

type ObraRateio = { id: string; nome: string; etapas: { id: string; nome: string }[] };
type RateioLinha = { obraId: string; etapaId: string; percent: string };
type ParcelaLinha = { rotulo: string; valor: string; vencimento: string };

/** Limite padrão do corpo de server action no Next é 1 MB; deixa folga para o resto do payload. */
const MAX_BYTES_XML = 900 * 1024;

function bpDaLinha(r: RateioLinha): number {
  return percentEditavelParaBp(r.percent) ?? 0;
}

export function ImportarXmlForm({
  obras,
  arquivoInicial,
}: {
  obras: ObraRateio[];
  /** XML já escolhido em outra tela (envio único em /notas/nova): lido ao montar. */
  arquivoInicial?: File;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendente, startTransition] = useTransition();
  const [lendo, setLendo] = useState(false);

  const [arquivo, setArquivo] = useState<{ nome: string; xml: string } | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [nfe, setNfe] = useState<Nfe | null>(null);
  const [situacao, setSituacao] = useState<SituacaoImportacao | null>(null);
  const [existente, setExistente] = useState<{ id: string; mensagem: string } | null>(null);

  const [tipos, setTipos] = useState<TipoItem[]>([]);
  const [rateios, setRateios] = useState<RateioLinha[]>([
    { obraId: obras[0]?.id ?? "", etapaId: "", percent: "100" },
  ]);
  const [parcelas, setParcelas] = useState<ParcelaLinha[]>([]);

  function limpar() {
    setArquivo(null);
    setNfe(null);
    setSituacao(null);
    setExistente(null);
    setTipos([]);
    setParcelas([]);
  }

  const inicialLido = useRef(false);
  useEffect(() => {
    if (arquivoInicial && !inicialLido.current) {
      inicialLido.current = true;
      void escolherArquivo(arquivoInicial);
    }
    // só no primeiro render: o arquivo inicial não muda depois de montado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function escolherArquivo(file: File | undefined) {
    if (!file) return;
    limpar();
    setErroArquivo(null);
    if (file.size > MAX_BYTES_XML) {
      setErroArquivo("Arquivo grande demais para importar (máximo 900 KB).");
      return;
    }
    setLendo(true);
    try {
      const xml = await file.text();
      const lido = parseNfeXml(xml);
      if (!lido.ok) {
        setErroArquivo(lido.erro);
        return;
      }
      const n = lido.nfe;
      setArquivo({ nome: file.name, xml });
      setNfe(n);
      setTipos(n.itens.map((i) => i.tipoSugerido));
      setParcelas(
        parcelasDaNfe(n).map((p, i) => ({
          rotulo: n.duplicatas[i]?.numero ?? `${p.numero}ª`,
          valor: centsParaEditavel(p.valorCents),
          vencimento: p.vencimento,
        })),
      );
      setLendo(false); // a prévia já está na tela; a consulta abaixo só completa os avisos
      const s = await consultarSituacaoImportacao(n.chave, n.emitente.documento);
      setSituacao(s);
      if (s.notaExistente) {
        setExistente({
          id: s.notaExistente.id,
          mensagem: `Esta NF-e já foi importada (NF ${s.notaExistente.numero}).`,
        });
      }
    } catch (e) {
      setErroArquivo(e instanceof Error ? e.message : "Não foi possível ler o arquivo");
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function alterarRateio(i: number, campos: Partial<RateioLinha>) {
    setRateios((prev) => prev.map((r, j) => (j === i ? { ...r, ...campos } : r)));
  }

  function alterarParcela(i: number, campos: Partial<ParcelaLinha>) {
    setParcelas((prev) => prev.map((p, j) => (j === i ? { ...p, ...campos } : p)));
  }

  function dividirIgualmenteClick() {
    if (rateios.length < 2) {
      toast.error("Adicione ao menos 2 obras ao rateio para dividir igualmente");
      return;
    }
    const fracoes = dividirIgualmente(rateios.length);
    setRateios((prev) => prev.map((r, i) => ({ ...r, percent: percentBpParaEditavel(fracoes[i]) })));
  }

  const somaRateioBp = rateios.reduce((acc, r) => acc + bpDaLinha(r), 0);
  const parcelasCents = parcelas.map((p) => moedaParaCents(p.valor));
  const somaParcelasCents = parcelasCents.reduce((a, v) => a + v, 0);

  function importar() {
    if (!nfe || !arquivo) return;
    if (rateios.some((r) => !r.obraId)) {
      toast.error("Selecione a obra em todas as linhas do rateio");
      return;
    }
    const rateiosBp = rateios.map((r) => ({
      obraId: r.obraId,
      etapaId: r.etapaId || undefined,
      fracaoBp: bpDaLinha(r),
    }));
    if (!validarRateio(rateiosBp).ok) {
      toast.error("O rateio entre obras deve somar 100%");
      return;
    }
    const parcelasPayload = parcelas.map((p, i) => ({
      numero: i + 1,
      valorCents: parcelasCents[i],
      vencimento: p.vencimento,
    }));
    if (!validarParcelas(parcelasPayload, nfe.totalCents).ok) {
      toast.error("A soma das parcelas deve ser igual ao total da nota");
      return;
    }

    startTransition(async () => {
      // No sucesso a action redireciona para a nota criada.
      const res = await importarNfe({
        xml: arquivo.xml,
        nomeArquivo: arquivo.nome,
        tipos,
        rateios: rateiosBp,
        parcelas: parcelasPayload,
      });
      if (res.ok) return;
      if (res.notaExistenteId) {
        setExistente({ id: res.notaExistenteId, mensagem: res.erro ?? "Esta nota já foi lançada." });
      }
      toast.error(res.erro ?? "Erro ao importar a nota");
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Arquivo XML</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => escolherArquivo(e.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={lendo || pendente} onClick={() => inputRef.current?.click()}>
              <FileCode2 className="size-4" />
              {lendo ? "Lendo..." : arquivo ? "Escolher outro arquivo" : "Escolher arquivo .xml"}
            </Button>
            {arquivo && <span className="truncate text-sm text-muted-foreground">{arquivo.nome}</span>}
          </div>
          {erroArquivo && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erroArquivo}
            </p>
          )}
        </CardContent>
      </Card>

      {existente && <AvisoNotaExistente notaId={existente.id} mensagem={existente.mensagem} />}

      {nfe && (
        <>
          <PreviaCabecalho nfe={nfe} situacao={situacao} />

          {nfe.avisos.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {nfe.avisos.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}

          <PreviaItens
            nfe={nfe}
            tipos={tipos}
            onTipo={(i, tipo) => setTipos((prev) => prev.map((t, j) => (j === i ? tipo : t)))}
          />

          {/* Rateio */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                Rateio entre obras
                <CampoAjuda titulo="Rateio entre obras">
                  Distribui o valor desta nota entre uma ou mais obras, em percentual. A soma precisa
                  fechar <b>100%</b>. Informe a <b>etapa</b> se quiser lançar o custo num estágio
                  específico da obra.
                </CampoAjuda>
              </CardTitle>
              <span
                className={
                  somaRateioBp === BP_TOTAL ? "text-sm text-green-600" : "text-sm font-medium text-destructive"
                }
              >
                {percentBpParaEditavel(somaRateioBp)}% de 100%
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {rateios.map((r, i) => {
                const obra = obras.find((o) => o.id === r.obraId);
                return (
                  <div key={i} className="grid grid-cols-[1fr_90px_36px] gap-2 md:grid-cols-[1fr_1fr_110px_36px]">
                    <Combobox
                      options={obras.map((o) => ({ value: o.id, label: o.nome }))}
                      value={r.obraId}
                      onChange={(obraId) => alterarRateio(i, { obraId, etapaId: "" })}
                      erro={!r.obraId}
                      placeholder="Obra..."
                      vazio="Nenhuma obra encontrada"
                      mensagemErro="Selecione a obra"
                    />
                    <SelectNativo
                      aria-label="Etapa"
                      value={r.etapaId}
                      onChange={(e) => alterarRateio(i, { etapaId: e.target.value })}
                      className="col-span-3 row-start-2 md:col-span-1 md:row-start-auto"
                    >
                      <option value="">Etapa (opcional)</option>
                      {obra?.etapas.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                    </SelectNativo>
                    <Input
                      aria-label="Percentual"
                      inputMode="decimal"
                      placeholder="%"
                      value={r.percent}
                      onChange={(e) => alterarRateio(i, { percent: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remover obra"
                      disabled={rateios.length === 1}
                      onClick={() => setRateios((prev) => prev.filter((_, j) => j !== i))}
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
                  onClick={() => setRateios((prev) => [...prev, { obraId: "", etapaId: "", percent: "" }])}
                >
                  <Plus className="size-4" /> Obra
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={dividirIgualmenteClick}>
                  <Wand2 className="size-4" /> Dividir igualmente
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Parcelas */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                Parcelas
                <CampoAjuda titulo="Parcelas">
                  Vêm das duplicatas (boletos) do XML. Sem duplicatas, a nota entra com uma parcela
                  única vencendo na data de emissão. Ajuste valores e datas se precisar — a soma deve
                  fechar com o total da nota.
                </CampoAjuda>
              </CardTitle>
              <span
                className={
                  somaParcelasCents !== nfe.totalCents
                    ? "text-sm font-medium text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                Soma: {formatarMoeda(somaParcelasCents)}
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              {nfe.duplicatas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  O XML não traz duplicatas: parcela única com vencimento na emissão ({formatarDataXml(nfe.dataEmissao)}).
                </p>
              )}
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-[48px_1fr_1fr] items-center gap-2">
                  <span className="text-sm text-muted-foreground">{p.rotulo}</span>
                  <Input
                    aria-label={`Valor da parcela ${i + 1}`}
                    inputMode="decimal"
                    value={p.valor}
                    onChange={(e) => alterarParcela(i, { valor: e.target.value })}
                  />
                  <Input
                    aria-label={`Vencimento da parcela ${i + 1}`}
                    type="date"
                    value={p.vencimento}
                    onChange={(e) => alterarParcela(i, { vencimento: e.target.value })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 pb-4">
            <Button variant="outline" render={<Link href="/notas" />}>
              Cancelar
            </Button>
            <Button type="button" disabled={pendente || !!existente} onClick={importar}>
              <Upload className="size-4" />
              {pendente ? "Importando..." : "Importar nota"}
            </Button>
          </div>
        </>
      )}

      {!nfe && !erroArquivo && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Label className="text-foreground">Como funciona</Label>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Aceita o XML da NF-e autorizada (com ou sem o protocolo de autorização).</li>
            <li>O fornecedor é localizado pelo CNPJ; se não existir, é cadastrado automaticamente.</li>
            <li>A mesma NF-e (chave de acesso) não pode ser importada duas vezes.</li>
            <li>O XML fica anexado à nota.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
