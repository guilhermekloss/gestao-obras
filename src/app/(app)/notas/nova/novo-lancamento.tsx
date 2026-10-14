"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dataParaInput, formatarMoeda } from "@/lib/format";
import { prepararFoto } from "@/lib/imagem";
import { cn } from "@/lib/utils";
import type { LeituraNormalizada } from "@/services/leitura-documento";
import { NotaForm, type FornecedorOption, type ObraOption } from "../nota-form";
import { valoresDaLeitura, type NotaFormValues } from "../nota-form-model";
import { ImportarXmlForm } from "../importar-xml/importar-xml-form";
import { AvisoNotaExistente } from "../importar-xml/previa-nfe";
import { lerDocumento } from "./actions";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Loader2, Paperclip, ScanLine, Upload } from "lucide-react";

/** Mesmo limite do /api/upload. */
const MAX_BYTES = 8 * 1024 * 1024;

type Resultado = {
  arquivo: { nome: string; url: string };
  leitura?: LeituraNormalizada;
  notaExistente?: { id: string; numero: string } | null;
  /** leitura automática indisponível ou falhou: o arquivo ficou só anexado */
  erro?: string;
};

type Estado =
  | { etapa: "inicio" }
  | { etapa: "processando"; passo: string; nome: string }
  | { etapa: "xml"; arquivo: File }
  | { etapa: "lido"; resultado: Resultado; valores: Partial<NotaFormValues>; sugerido?: { nome: string; documento: string | null } };

function ehXml(f: File) {
  return /\.xml$/i.test(f.name) || f.type.includes("xml");
}

function ehFotoOuPdf(f: File) {
  return f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name);
}

/**
 * Novo lançamento com envio único: foto (câmera do celular), PDF ou XML da
 * NF-e. XML segue para a importação exata (`ImportarXmlForm`); foto e PDF são
 * lidos pelo leitor automático e preenchem o formulário para conferência. O
 * formulário manual fica sempre logo abaixo — quem não tem arquivo só preenche.
 */
export function NovoLancamento({
  fornecedores,
  obras,
  leituraAutomatica,
}: {
  fornecedores: FornecedorOption[];
  obras: ObraOption[];
  leituraAutomatica: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ etapa: "inicio" });
  // muda a cada leitura para remontar o formulário com os novos valores
  const [versaoForm, setVersaoForm] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);

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

    const hoje = dataParaInput(new Date());
    const soAnexo = (erro: string) => {
      setEstado({
        etapa: "lido",
        resultado: { arquivo: { nome, url }, erro },
        valores: { anexoUrl: url, anexoNome: nome },
      });
      setVersaoForm((v) => v + 1);
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

    const { leitura } = r;
    setEstado({
      etapa: "lido",
      resultado: { arquivo: { nome, url }, leitura, notaExistente: r.notaExistente },
      valores: valoresDaLeitura(leitura, { fornecedorId: r.fornecedor?.id ?? "", anexoUrl: url, anexoNome: nome, hoje }),
      sugerido:
        !r.fornecedor && leitura.fornecedor.nome
          ? { nome: leitura.fornecedor.nome, documento: leitura.fornecedor.documento }
          : undefined,
    });
    setVersaoForm((v) => v + 1);
    toast.success(leitura.avisos.length ? "Documento lido — confira os pontos destacados" : "Documento lido — confira e salve");
  }

  function recomecar() {
    setEstado({ etapa: "inicio" });
    setVersaoForm((v) => v + 1);
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

  const resultado = estado.etapa === "lido" ? estado.resultado : null;

  return (
    <div className="space-y-6">
      {inputs}

      {estado.etapa === "processando" ? (
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
      ) : resultado ? (
        <ResumoLeitura resultado={resultado} onOutro={recomecar} />
      ) : (
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
                  ? "Foto da nota, PDF (DANFE, NFS-e, recibo, boleto) ou o XML da NF-e. Você só confere e salva."
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
        defaultValues={estado.etapa === "lido" ? estado.valores : undefined}
        fornecedorSugerido={estado.etapa === "lido" ? estado.sugerido : undefined}
      />
    </div>
  );
}

function ResumoLeitura({ resultado, onOutro }: { resultado: Resultado; onOutro: () => void }) {
  const { leitura, arquivo, notaExistente, erro } = resultado;
  return (
    <div className="space-y-3">
      {notaExistente && (
        <AvisoNotaExistente
          notaId={notaExistente.id}
          mensagem={`Este documento já foi lançado (nº ${notaExistente.numero}). Salvar de novo duplicaria o custo.`}
        />
      )}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start gap-3">
            {leitura ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
            ) : (
              <Paperclip className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {leitura
                  ? `${leitura.descricaoDocumento} lido — ${formatarMoeda(leitura.totalCents)} em ${leitura.itens.length} ${leitura.itens.length === 1 ? "item" : "itens"}`
                  : "Arquivo anexado"}
              </p>
              <a
                href={arquivo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm text-muted-foreground hover:underline"
              >
                {arquivo.nome}
              </a>
              {leitura?.chaveNfe && (
                <p className="break-all font-mono text-xs text-muted-foreground">Chave {leitura.chaveNfe}</p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onOutro}>
              Enviar outro
            </Button>
          </div>
          {erro && <p className="text-sm text-muted-foreground">{erro}</p>}
          {leitura && (
            <p className="text-sm text-muted-foreground">
              Confira os campos abaixo, escolha a obra no rateio e salve. Nada é gravado antes disso.
            </p>
          )}
          {leitura && leitura.avisos.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {leitura.avisos.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
