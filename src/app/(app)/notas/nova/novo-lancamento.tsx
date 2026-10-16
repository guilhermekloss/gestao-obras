"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dataParaInput, formatarMoeda } from "@/lib/format";
import { prepararFoto } from "@/lib/imagem";
import { cn } from "@/lib/utils";
import { NotaForm, type FornecedorOption, type ObraOption } from "../nota-form";
import type { NotaFormValues } from "../nota-form-model";
import { ImportarXmlForm } from "../importar-xml/importar-xml-form";
import { AvisoNotaExistente } from "../importar-xml/previa-nfe";
import { lerDocumento, type LerDocumentoResult } from "./actions";
import { ConferenciaDialog, type LeituraConferida } from "./conferencia-dialog";
import { conferenciaDaReleitura, conferenciaInicial, type Conferencia } from "./conferencia-model";
import { ArrowLeft, Camera, ClipboardCheck, Loader2, Paperclip, ScanLine, Upload } from "lucide-react";

// mesmo limite do /api/upload
const MAX_BYTES = 8 * 1024 * 1024;

type Estado =
  | { etapa: "inicio" }
  | { etapa: "processando"; passo: string; nome: string }
  | { etapa: "xml"; arquivo: File }
  | { etapa: "anexado"; arquivo: { nome: string; url: string }; motivo: string }
  | { etapa: "conferencia"; dados: LeituraConferida; levadoAoFormulario: boolean };

type Formulario = { valores?: Partial<NotaFormValues>; sugerido?: { nome: string; documento: string | null } };

function ehXml(f: File) {
  return /\.xml$/i.test(f.name) || f.type.includes("xml");
}

function ehFotoOuPdf(f: File) {
  return f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name);
}

export function NovoLancamento({
  fornecedores,
  obras,
  leituraAutomatica,
  analiseIa,
}: {
  fornecedores: FornecedorOption[];
  obras: ObraOption[];
  leituraAutomatica: boolean;
  analiseIa: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ etapa: "inicio" });
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [formulario, setFormulario] = useState<Formulario>({});
  // muda para remontar o formulário com novos valores iniciais
  const [versaoForm, setVersaoForm] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);

  function preencherFormulario(f: Formulario) {
    setFormulario(f);
    setVersaoForm((v) => v + 1);
  }

  async function receber(file: File | undefined) {
    if (!file) return;
    if (inputArquivo.current) inputArquivo.current.value = "";
    if (inputCamera.current) inputCamera.current.value = "";

    if (ehXml(file)) {
      setEstado({ etapa: "xml", arquivo: file });
      return;
    }
    if (!ehFotoOuPdf(file)) {
      toast.error("Envie uma foto, um PDF ou o XML da NF-e.");
      return;
    }

    setConferencia(null);
    preencherFormulario({});
    setEstado({ etapa: "processando", passo: "Enviando o arquivo...", nome: file.name });
    const nome = file.name;
    let url: string;
    try {
      const preparado = await prepararFoto(file);
      if (preparado.size > MAX_BYTES) throw new Error("Arquivo maior que 8 MB.");
      const fd = new FormData();
      fd.append("file", preparado);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro ?? "Falha no envio do arquivo.");
      url = corpo.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio do arquivo.");
      setEstado({ etapa: "inicio" });
      return;
    }

    const soAnexo = (motivo: string) => {
      setEstado({ etapa: "anexado", arquivo: { nome, url }, motivo });
      preencherFormulario({ valores: { anexoUrl: url, anexoNome: nome } });
    };

    if (!leituraAutomatica) {
      soAnexo("A leitura automática de fotos e PDFs não está ativada. O arquivo ficou anexado: preencha os dados abaixo.");
      return;
    }

    setEstado({ etapa: "processando", passo: "Lendo os dados da nota...", nome });
    const r = await lerDocumento(url).catch((e: unknown) => ({
      ok: false as const,
      erro: e instanceof Error ? e.message : "Erro ao ler o documento",
    }));
    if (!r.ok) {
      soAnexo(`${r.erro} O arquivo ficou anexado: preencha os dados abaixo.`);
      return;
    }

    const dados: LeituraConferida = { ...r, arquivo: { nome, url } };
    setConferencia(
      conferenciaInicial(r.leitura, r.correspondencia, {
        anexoUrl: url,
        anexoNome: nome,
        hoje: dataParaInput(new Date()),
        obraPadrao: obras[0]?.id ?? "",
      }),
    );
    setEstado({ etapa: "conferencia", dados, levadoAoFormulario: false });
    setDialogAberto(true);
  }

  function aplicarReleitura(r: Extract<LerDocumentoResult, { ok: true }>) {
    if (estado.etapa !== "conferencia") return;
    const { arquivo } = estado.dados;
    setConferencia((c) =>
      c &&
      conferenciaDaReleitura(c, r.leitura, r.correspondencia, {
        anexoUrl: arquivo.url,
        anexoNome: arquivo.nome,
        hoje: dataParaInput(new Date()),
        obraPadrao: obras[0]?.id ?? "",
      }),
    );
    setEstado({ ...estado, dados: { ...r, arquivo, origem: "ia" } });
  }

  function levarParaFormulario() {
    if (!conferencia || estado.etapa !== "conferencia") return;
    const f = conferencia.fornecedor;
    const lido = estado.dados.leitura.fornecedor;
    preencherFormulario({
      valores: { ...conferencia.valores, fornecedorId: f.modo === "existente" ? f.id : "" },
      sugerido:
        f.modo === "novo"
          ? { nome: f.nome, documento: f.documento.replace(/\D/g, "") || null }
          : f.modo === "pendente" && lido.nome
            ? { nome: lido.nome, documento: lido.documento }
            : undefined,
    });
    setEstado({ ...estado, levadoAoFormulario: true });
    setDialogAberto(false);
    toast.info("Dados levados ao formulário — revise e salve.");
  }

  function recomecar() {
    setEstado({ etapa: "inicio" });
    setConferencia(null);
    preencherFormulario({});
  }

  const inputs = (
    <>
      <input
        ref={inputArquivo}
        type="file"
        accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml"
        className="hidden"
        onChange={(e) => receber(e.target.files?.[0])}
      />
      <input
        ref={inputCamera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => receber(e.target.files?.[0])}
      />
    </>
  );

  if (estado.etapa === "xml") {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" onClick={recomecar}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <ImportarXmlForm obras={obras} arquivoInicial={estado.arquivo} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {inputs}

      {estado.etapa === "processando" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6" aria-live="polite">
            <Loader2 className="size-6 shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="font-medium">{estado.passo}</p>
              <p className="truncate text-sm text-muted-foreground">
                {estado.nome} · costuma levar de 10 a 30 segundos
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {estado.etapa === "anexado" && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex flex-wrap items-start gap-3">
              <Paperclip className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Arquivo anexado</p>
                <ArquivoLink arquivo={estado.arquivo} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={recomecar}>
                Enviar outro
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{estado.motivo}</p>
          </CardContent>
        </Card>
      )}

      {estado.etapa === "conferencia" && conferencia && (
        <>
          {estado.dados.notaExistente && (
            <AvisoNotaExistente
              notaId={estado.dados.notaExistente.id}
              mensagem={`Este documento já foi lançado (nº ${estado.dados.notaExistente.numero}). Salvar de novo duplicaria o custo.`}
            />
          )}
          <Card>
            <CardContent className="flex flex-wrap items-start gap-3 py-4">
              <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {estado.dados.leitura.descricaoDocumento} lido — {formatarMoeda(estado.dados.leitura.totalCents)}
                </p>
                <ArquivoLink arquivo={estado.dados.arquivo} />
                <p className="mt-1 text-sm text-muted-foreground">
                  {estado.levadoAoFormulario
                    ? "Os dados foram levados ao formulário abaixo: revise e salve."
                    : "Os dados esperam a sua conferência. Nada é gravado antes de você confirmar."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!estado.levadoAoFormulario && (
                  <Button type="button" onClick={() => setDialogAberto(true)}>
                    <ClipboardCheck className="size-4" /> Conferir dados
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={recomecar}>
                  Enviar outro
                </Button>
              </div>
            </CardContent>
          </Card>
          <ConferenciaDialog
            aberto={dialogAberto}
            onAbertoChange={setDialogAberto}
            dados={estado.dados}
            conferencia={conferencia}
            setConferencia={(acao) => setConferencia((c) => c && (typeof acao === "function" ? acao(c) : acao))}
            fornecedores={fornecedores}
            obras={obras}
            onLevarParaFormulario={levarParaFormulario}
            analiseIa={analiseIa}
            onReleitura={aplicarReleitura}
          />
        </>
      )}

      {estado.etapa === "inicio" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            receber(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "rounded-xl border-2 border-dashed p-5 transition-colors",
            arrastando ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30",
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ScanLine className="hidden size-10 shrink-0 text-primary sm:block" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Tem a nota em mãos? Envie e o sistema preenche para você.</p>
              <p className="text-sm text-muted-foreground">
                {leituraAutomatica
                  ? "Foto da nota, PDF (DANFE, NFS-e, recibo, boleto) ou o XML da NF-e. Você confere os dados e confirma."
                  : "XML da NF-e é lido automaticamente; foto e PDF ficam anexados ao lançamento."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => inputCamera.current?.click()}>
                <Camera className="size-4" /> Tirar foto
              </Button>
              <Button type="button" variant="outline" onClick={() => inputArquivo.current?.click()}>
                <Upload className="size-4" /> Enviar arquivo
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Sem arquivo? Preencha manualmente o formulário abaixo.
          </p>
        </div>
      )}

      <NotaForm
        key={versaoForm}
        fornecedores={fornecedores}
        obras={obras}
        defaultValues={formulario.valores}
        fornecedorSugerido={formulario.sugerido}
      />
    </div>
  );
}

function ArquivoLink({ arquivo }: { arquivo: { nome: string; url: string } }) {
  return (
    <a
      href={arquivo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate text-sm text-muted-foreground hover:underline"
    >
      {arquivo.nome}
    </a>
  );
}
