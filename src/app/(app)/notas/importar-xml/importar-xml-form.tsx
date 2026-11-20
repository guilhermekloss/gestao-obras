"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { TipoItem } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { BarraDeAcao } from "@/components/barra-de-acao";
import { CabecalhoSecao } from "@/components/cabecalho-secao";
import { CampoForm, MensagemErro, atributosDoErro } from "@/components/campo-form";
import { Combobox } from "@/components/combobox";
import { ResumoLancamento } from "@/components/resumo-lancamento";
import { SelectNativo } from "@/components/select-nativo";
import {
  centsParaEditavel,
  formatarMoeda,
  moedaParaCents,
  percentBpParaEditavel,
  percentEditavelParaBp,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { BP_TOTAL, dividirIgualmente, validarRateio } from "@/services/rateio";
import { validarParcelas } from "@/services/parcelas";
import { dadosImportaveis, mensagemNotaJaImportada, parseDocumentoXml, type DadosImportaveis, type DocumentoXml } from "@/services/documento-xml";
import { errosDeVinculos, vinculoInicial, type MaterialCatalogo, type VinculoMaterial } from "@/services/materiais";
import { vinculosParaAction } from "../nova/conferencia-model";
import { consultarSituacaoImportacao, importarNfe, sugerirMateriais, type SituacaoImportacao } from "./actions";
import { ConferenciaDaPrevia } from "./conferencia-previa";
import { AvisoNotaExistente } from "./aviso-nota-existente";
import { PreviaCabecalho, PreviaItens } from "./previa-nfe";
import { PreviaNfse } from "./previa-nfse";
import { linhasDeConferencia } from "../conferencia-lancamento";
import { AvisoCno } from "../aviso-cno";
import { AlertTriangle, FileCode2, ListChecks, Percent, Plus, Trash2, Upload, Wallet, Wand2 } from "lucide-react";

type ObraRateio = { id: string; nome: string; cno?: string | null; etapas: { id: string; nome: string }[] };
type RateioLinha = { obraId: string; etapaId: string; percent: string };
type ParcelaLinha = { rotulo: string; valor: string; vencimento: string };
type SecaoXml = "itens" | "rateio" | "parcelas";
const SECOES: SecaoXml[] = ["itens", "rateio", "parcelas"];

// espera a seção abrir antes de mover o foco (campo dentro de painel fechado não recebe foco)
function depoisDeAbrir(acao: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(acao));
}

// o corpo de server action no Next tem limite padrão de 1 MB; folga para o resto do payload
const MAX_BYTES_XML = 900 * 1024;

function bpDaLinha(r: RateioLinha): number {
  return percentEditavelParaBp(r.percent) ?? 0;
}

export function ImportarXmlForm({
  obras,
  materiais = [],
  arquivoInicial,
  xmlInicial,
}: {
  obras: ObraRateio[];
  materiais?: MaterialCatalogo[];
  arquivoInicial?: File;
  /** XML já em mãos no servidor (NF-e recebida da Sefaz). */
  xmlInicial?: { nome: string; xml: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [pendente, startTransition] = useTransition();
  const [secoes, setSecoes] = useState<SecaoXml[]>(SECOES);
  // só depois da primeira tentativa de importar os campos ganham mensagem de erro
  const [tentouImportar, setTentouImportar] = useState(false);
  const [lendo, setLendo] = useState(false);

  const [arquivo, setArquivo] = useState<{ nome: string; xml: string } | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  // NF-e ou NFS-e, conforme o conteúdo; `dados` é a parte comum que vai para o lançamento
  const [nota, setNota] = useState<{ doc: DocumentoXml; dados: DadosImportaveis } | null>(null);
  const dados = nota?.dados ?? null;
  const [situacao, setSituacao] = useState<SituacaoImportacao | null>(null);
  const [existente, setExistente] = useState<{ id: string; mensagem: string } | null>(null);

  const [tipos, setTipos] = useState<TipoItem[]>([]);
  const [vinculos, setVinculos] = useState<VinculoMaterial[]>([]);
  const [rateios, setRateios] = useState<RateioLinha[]>([
    { obraId: obras[0]?.id ?? "", etapaId: "", percent: "100" },
  ]);
  const [parcelas, setParcelas] = useState<ParcelaLinha[]>([]);
  // a obra do CNO só é pré-escolhida enquanto o usuário não mexeu no rateio desta nota
  const rateioTocado = useRef(false);

  function mexerNoRateio(atualizar: (prev: RateioLinha[]) => RateioLinha[]) {
    rateioTocado.current = true;
    setRateios(atualizar);
  }

  function usarObra(obraId: string) {
    mexerNoRateio(() => [{ obraId, etapaId: "", percent: "100" }]);
  }

  function limpar() {
    rateioTocado.current = false;
    setArquivo(null);
    setNota(null);
    setSituacao(null);
    setExistente(null);
    setTipos([]);
    setVinculos([]);
    setParcelas([]);
    setTentouImportar(false);
  }

  const inicialLido = useRef(false);
  useEffect(() => {
    const inicial =
      arquivoInicial ?? (xmlInicial ? new File([xmlInicial.xml], xmlInicial.nome, { type: "text/xml" }) : undefined);
    if (inicial && !inicialLido.current) {
      inicialLido.current = true;
      void escolherArquivo(inicial);
    }
    // só ao montar: o arquivo inicial não muda depois
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
      const lido = parseDocumentoXml(xml);
      if (!lido.ok) {
        setErroArquivo(lido.erro);
        return;
      }
      const n = dadosImportaveis(lido.doc);
      setArquivo({ nome: file.name, xml });
      setNota({ doc: lido.doc, dados: n });
      setTipos(n.itens.map((i) => i.tipoSugerido));
      setVinculos(n.itens.map((i) => vinculoInicial(undefined, i.tipoSugerido)));
      setParcelas(
        n.parcelas.map((p) => ({
          rotulo: p.rotulo ?? "",
          valor: centsParaEditavel(p.valorCents),
          vencimento: p.vencimento,
        })),
      );
      setLendo(false);
      const [s, correspondencias] = await Promise.all([
        consultarSituacaoImportacao(n.chave, n.emitente.documento, n.cno),
        sugerirMateriais(n.emitente.documento, n.itens.map((i) => ({ descricao: i.descricao, codigo: i.codigo }))),
      ]);
      setSituacao(s);
      const ativas = s.obrasDoCno.filter((o) => o.ativa);
      if (ativas.length === 1 && !rateioTocado.current) {
        setRateios([{ obraId: ativas[0].id, etapaId: "", percent: "100" }]);
      }
      setVinculos(n.itens.map((i, idx) => vinculoInicial(correspondencias[idx], i.tipoSugerido)));
      if (s.notaExistente) {
        setExistente({
          id: s.notaExistente.id,
          mensagem: mensagemNotaJaImportada(n.chave, s.notaExistente.numero),
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
    mexerNoRateio((prev) => prev.map((r, j) => (j === i ? { ...r, ...campos } : r)));
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
    mexerNoRateio((prev) => prev.map((r, i) => ({ ...r, percent: percentBpParaEditavel(fracoes[i]) })));
  }

  const somaRateioBp = rateios.reduce((acc, r) => acc + bpDaLinha(r), 0);
  const parcelasCents = parcelas.map((p) => moedaParaCents(p.valor));
  const somaParcelasCents = parcelasCents.reduce((a, v) => a + v, 0);
  const somaItensCents = dados?.itens.reduce((acc, i) => acc + i.totalCents, 0) ?? 0;

  const conferencia = linhasDeConferencia({
    totalCents: dados?.totalCents ?? 0,
    somaItensCents,
    somaRateioBp,
    parcelas: parcelas.length,
    somaParcelasCents,
  });
  const [, linhaRateio, linhaParcelas] = conferencia;

  // erros de cada seção; só aparecem depois da primeira tentativa de importar
  const errosVinculos = tentouImportar ? errosDeVinculos(vinculos) : [];
  const erroObra = (r: RateioLinha) => (tentouImportar && !r.obraId ? "Selecione a obra." : null);
  const erroPercent = (r: RateioLinha) => (tentouImportar && !r.percent.trim() ? "Informe o percentual." : null);
  const erroRateio =
    tentouImportar && linhaRateio.situacao === "erro" ? `O rateio precisa somar 100%. ${linhaRateio.detalhe}.` : null;
  const erroValor = (p: ParcelaLinha) => (tentouImportar && !p.valor.trim() ? "Informe o valor da parcela." : null);
  const erroVencimento = (p: ParcelaLinha) => (tentouImportar && !p.vencimento ? "Informe o vencimento." : null);
  const erroParcelas =
    tentouImportar && linhaParcelas.situacao === "erro"
      ? `As parcelas precisam somar o total da nota. ${linhaParcelas.detalhe}.`
      : null;
  const secaoComErro: Record<SecaoXml, boolean> = {
    itens: errosVinculos.length > 0,
    rateio: Boolean(erroRateio || rateios.some((r) => erroObra(r) || erroPercent(r))),
    parcelas: Boolean(erroParcelas || parcelas.some((p) => erroValor(p) || erroVencimento(p))),
  };

  function abrir(ids: SecaoXml[]) {
    setSecoes((atuais) => [...new Set([...atuais, ...ids])]);
  }

  function irParaSecao(id: SecaoXml) {
    abrir([id]);
    depoisDeAbrir(() => {
      const item = document.getElementById(`secao-xml-${id}`);
      item?.scrollIntoView({ block: "start" });
      item?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  }

  function importar() {
    if (!dados || !arquivo) return;
    setTentouImportar(true);

    const rateiosBp = rateios.map((r) => ({
      obraId: r.obraId,
      etapaId: r.etapaId || undefined,
      fracaoBp: bpDaLinha(r),
    }));
    const parcelasPayload = parcelas.map((p, i) => ({
      numero: i + 1,
      valorCents: parcelasCents[i],
      vencimento: p.vencimento,
    }));

    const falhas: SecaoXml[] = [];
    if (errosDeVinculos(vinculos).length > 0) falhas.push("itens");
    if (
      rateios.some((r) => !r.obraId || !r.percent.trim()) ||
      !validarRateio(rateiosBp).ok
    ) {
      falhas.push("rateio");
    }
    if (
      parcelas.some((p) => !p.valor.trim() || !p.vencimento) ||
      !validarParcelas(parcelasPayload, dados.totalCents).ok
    ) {
      falhas.push("parcelas");
    }
    if (falhas.length > 0) {
      abrir(falhas);
      depoisDeAbrir(() => {
        const alvo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-foco-erro]');
        alvo?.scrollIntoView({ block: "center" });
        alvo?.focus({ preventScroll: true });
      });
      return;
    }

    startTransition(async () => {
      // no sucesso a action redireciona
      const res = await importarNfe({
        xml: arquivo.xml,
        nomeArquivo: arquivo.nome,
        tipos,
        materiais: vinculosParaAction(vinculos),
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

  const previa =
    nota?.doc.tipo === "NFSE" ? (
      <PreviaNfse nfse={nota.doc.nfse} situacao={situacao} />
    ) : nota?.doc.tipo === "NFE" ? (
      <PreviaCabecalho nfe={nota.doc.nfe} situacao={situacao} />
    ) : null;
  const nomesDasObras = rateios.map((r) => obras.find((o) => o.id === r.obraId)?.nome).filter(Boolean);

  return (
    <div ref={formRef} className={cn("space-y-4", dados && "pb-24 md:pb-0")}>
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
            {arquivo && <span className="min-w-0 truncate text-sm text-muted-foreground">{arquivo.nome}</span>}
          </div>
          {erroArquivo && <MensagemErro id="arquivo-xml">{erroArquivo}</MensagemErro>}
        </CardContent>
      </Card>

      {existente && <AvisoNotaExistente notaId={existente.id} mensagem={existente.mensagem} />}

      {dados && (
        <>
          {previa}

          {dados.avisos.length > 0 && (
            <ul className="space-y-1 rounded-md border border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg">
              {dados.avisos.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}

          <ResumoLancamento
            total={formatarMoeda(dados.totalCents)}
            linhas={conferencia}
            pendentesExtras={errosVinculos.length > 0 ? 1 : 0}
            onIr={(id) => irParaSecao(id as SecaoXml)}
          />

          <Accordion multiple value={secoes} onValueChange={(valor) => setSecoes(valor as SecaoXml[])}>
            <AccordionItem value="itens" id="secao-xml-itens" className="scroll-mt-56">
              <AccordionTrigger>
                <CabecalhoSecao
                  compacto
                  icone={ListChecks}
                  titulo="Itens"
                  resumo={`${dados.itens.length} ${dados.itens.length === 1 ? "item" : "itens"} · ${formatarMoeda(somaItensCents)}`}
                  preenchida={errosDeVinculos(vinculos).length === 0}
                  aviso={somaItensCents !== dados.totalCents}
                  erro={secaoComErro.itens}
                />
              </AccordionTrigger>
              <AccordionPanel keepMounted>
                <ConferenciaDaPrevia key={dados.chave} dados={dados} />
                <PreviaItens
                  nfe={dados}
                  tipos={tipos}
                  onTipo={(i, tipo) => {
                    setTipos((prev) => prev.map((t, j) => (j === i ? tipo : t)));
                    // frete, serviço e encargo não têm material; ao voltar para material, o usuário decide de novo
                    setVinculos((prev) =>
                      prev.map((v, j) => {
                        if (j !== i) return v;
                        if (tipo !== "MATERIAL") return { modo: "nenhum" };
                        return v.modo === "nenhum" ? { modo: "pendente", candidatos: [] } : v;
                      }),
                    );
                  }}
                  vinculos={vinculos}
                  catalogo={materiais}
                  onVinculo={(i, v) => setVinculos((prev) => prev.map((x, j) => (j === i ? v : x)))}
                />
                {errosVinculos.length > 0 && (
                  <MensagemErro id="vinculos" focavel>
                    {errosVinculos[0]}
                    {errosVinculos.length > 1 && ` (mais ${errosVinculos.length - 1} nesta lista)`}
                  </MensagemErro>
                )}
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="rateio" id="secao-xml-rateio" className="scroll-mt-56">
              <AccordionTrigger>
                <CabecalhoSecao
                  compacto
                  icone={Percent}
                  titulo="Rateio entre obras"
                  resumo={
                    nomesDasObras.length === 0
                      ? "Escolha a obra"
                      : `${percentBpParaEditavel(somaRateioBp)}% · ${nomesDasObras.length === 1 ? nomesDasObras[0] : `${nomesDasObras.length} obras`}`
                  }
                  preenchida={somaRateioBp === BP_TOTAL && rateios.every((r) => r.obraId)}
                  erro={secaoComErro.rateio}
                />
              </AccordionTrigger>
              <AccordionPanel keepMounted>
                <p className="text-sm text-muted-foreground">
                  Divide o valor da nota entre uma ou mais obras, em percentual. A soma precisa fechar 100%.
                  Informe a etapa se o custo for de um estágio específico.
                </p>
                {dados.cno && situacao && (
                  <AvisoCno
                    cno={dados.cno}
                    obrasDoCno={situacao.obrasDoCno}
                    obraEscolhida={rateios.length === 1 ? obras.find((o) => o.id === rateios[0].obraId) : undefined}
                    onUsarObra={usarObra}
                    onCnoGravado={(obra) => setSituacao((s) => s && { ...s, obrasDoCno: [obra] })}
                  />
                )}
                {rateios.map((r, i) => {
                  const obra = obras.find((o) => o.id === r.obraId);
                  const id = (campo: string) => `xml-rateio-${i}-${campo}`;
                  return (
                    <div key={i} className="grid grid-cols-2 items-start gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_8rem_auto]">
                      <CampoForm id={id("obra")} rotulo="Obra" className="col-span-2 md:col-span-1">
                        <Combobox
                          id={id("obra")}
                          options={obras.map((o) => ({ value: o.id, label: o.nome }))}
                          value={r.obraId}
                          onChange={(obraId) => alterarRateio(i, { obraId, etapaId: "" })}
                          erro={Boolean(erroObra(r))}
                          placeholder="Escolher obra..."
                          vazio="Nenhuma obra encontrada"
                          mensagemErro="Selecione a obra."
                        />
                      </CampoForm>
                      <CampoForm id={id("etapa")} rotulo="Etapa (opcional)" className="col-span-2 md:col-span-1">
                        <SelectNativo
                          id={id("etapa")}
                          value={r.etapaId}
                          onChange={(e) => alterarRateio(i, { etapaId: e.target.value })}
                        >
                          <option value="">Sem etapa</option>
                          {obra?.etapas.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nome}
                            </option>
                          ))}
                        </SelectNativo>
                      </CampoForm>
                      <CampoForm id={id("percent")} rotulo="Percentual (%)" erro={erroPercent(r)}>
                        <Input
                          id={id("percent")}
                          inputMode="decimal"
                          placeholder="100"
                          value={r.percent}
                          {...atributosDoErro(id("percent"), erroPercent(r))}
                          onChange={(e) => alterarRateio(i, { percent: e.target.value })}
                        />
                      </CampoForm>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="justify-self-end md:mt-7"
                        disabled={rateios.length === 1}
                        onClick={() => mexerNoRateio((prev) => prev.filter((_, j) => j !== i))}
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
                    onClick={() => mexerNoRateio((prev) => [...prev, { obraId: "", etapaId: "", percent: "" }])}
                  >
                    <Plus className="size-4" /> Adicionar obra
                  </Button>
                  <Button type="button" variant="outline" onClick={dividirIgualmenteClick}>
                    <Wand2 className="size-4" /> Dividir igualmente
                  </Button>
                </div>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="parcelas" id="secao-xml-parcelas" className="scroll-mt-56">
              <AccordionTrigger>
                <CabecalhoSecao
                  compacto
                  icone={Wallet}
                  titulo="Parcelas"
                  resumo={`${parcelas.length} ${parcelas.length === 1 ? "parcela" : "parcelas"} · ${formatarMoeda(somaParcelasCents)}`}
                  preenchida={parcelas.length > 0 && linhaParcelas.situacao === "ok"}
                  erro={secaoComErro.parcelas}
                />
              </AccordionTrigger>
              <AccordionPanel keepMounted>
                <p className="text-sm text-muted-foreground">
                  {dados.explicacaoParcelas}{" "}
                  Ajuste valores e datas se precisar. A soma deve fechar com o total da nota.
                </p>
                {parcelas.map((p, i) => {
                  const id = (campo: string) => `xml-parcela-${i}-${campo}`;
                  return (
                    <div key={i} className="grid grid-cols-2 items-start gap-3 rounded-xl border p-3 sm:grid-cols-[8rem_1fr_1fr]">
                      <p className="col-span-2 font-semibold [font-stretch:112%] sm:col-span-1 sm:mt-8">
                        Parcela {i + 1}
                        {p.rotulo && (
                          <span className="block text-sm font-normal text-muted-foreground">{p.rotulo}</span>
                        )}
                      </p>
                      <CampoForm id={id("valor")} rotulo="Valor (R$)" erro={erroValor(p)}>
                        <Input
                          id={id("valor")}
                          inputMode="decimal"
                          value={p.valor}
                          {...atributosDoErro(id("valor"), erroValor(p))}
                          onChange={(e) => alterarParcela(i, { valor: e.target.value })}
                        />
                      </CampoForm>
                      <CampoForm id={id("vencimento")} rotulo="Vencimento" erro={erroVencimento(p)}>
                        <Input
                          id={id("vencimento")}
                          type="date"
                          value={p.vencimento}
                          {...atributosDoErro(id("vencimento"), erroVencimento(p))}
                          onChange={(e) => alterarParcela(i, { vencimento: e.target.value })}
                        />
                      </CampoForm>
                    </div>
                  );
                })}
                {erroParcelas && (
                  <MensagemErro id="parcelas" focavel>
                    {erroParcelas}
                  </MensagemErro>
                )}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>

          {/* no celular a barra fixa fica só com a ação principal; cancelar sobe para o fim do formulário */}
          <Button variant="ghost" className="w-full md:hidden" render={<Link href="/notas" />}>
            Cancelar
          </Button>

          <BarraDeAcao>
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "min-w-0 flex-1 text-sm leading-snug sr-only md:not-sr-only",
                tentouImportar && Object.values(secaoComErro).some(Boolean)
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {pendente
                ? "Importando..."
                : tentouImportar && Object.values(secaoComErro).some(Boolean)
                  ? "Corrija os campos marcados em vermelho."
                  : ""}
            </p>
            <Button variant="outline" className="hidden md:inline-flex" render={<Link href="/notas" />}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1 md:flex-none" disabled={pendente || !!existente} onClick={importar}>
              <Upload className="size-4" />
              {pendente ? "Importando..." : "Importar nota"}
            </Button>
          </BarraDeAcao>
        </>
      )}

      {!dados && !erroArquivo && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Label className="text-foreground">Como funciona</Label>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Aceita o XML da NF-e autorizada (com ou sem o protocolo de autorização) e o da NFS-e do padrão nacional.</li>
            <li>O fornecedor é localizado pelo CNPJ; se não existir, é cadastrado automaticamente.</li>
            <li>A mesma nota (chave de acesso) não pode ser importada duas vezes.</li>
            <li>Na NFS-e, o custo é o valor do serviço; as retenções (ISS, INSS, IRRF...) viram parcelas de guia.</li>
            <li>O XML fica anexado à nota.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
