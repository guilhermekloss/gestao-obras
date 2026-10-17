import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, ShieldCheck, Trash2 } from "lucide-react";
import { exigirPapel } from "@/lib/auth";
import { formatarData } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UFS, carregarEmpresa, rotuloCnpj } from "@/services/empresa";
import { DIAS_AVISO_CERTIFICADO } from "@/services/sefaz/painel";
import { removerCertificado } from "./actions";
import { CapturaForm, CertificadoForm, DadosEmpresaForm } from "./formularios";

export const metadata: Metadata = { title: "Empresa" };

export default async function EmpresaPage() {
  await exigirPapel("ADMIN");
  const empresa = await carregarEmpresa();
  const agora = new Date();
  const validade = empresa?.certificadoValidoAte ?? null;
  const dias = validade ? Math.ceil((validade.getTime() - agora.getTime()) / 86_400_000) : null;
  const temCertificado = Boolean(empresa?.certificadoCifrado);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Dados da empresa dona da plataforma, o certificado digital e a busca automática de NF-e na Sefaz.
        </p>
      </div>

      <Card id="secao-dados-empresa" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Os CNPJs servem para conferir se a nota lida é mesmo da empresa e para buscar as NF-e na Sefaz.
          </p>
          <DadosEmpresaForm
            ufs={Object.keys(UFS).sort()}
            inicial={{
              razaoSocial: empresa?.razaoSocial ?? "",
              nomeFantasia: empresa?.nomeFantasia ?? "",
              cnpj: empresa ? rotuloCnpj(empresa.cnpj) : "",
              filiais: empresa?.filiais.map(rotuloCnpj).join("\n") ?? "",
              uf: empresa?.uf ?? "PR",
            }}
          />
        </CardContent>
      </Card>

      <Card id="secao-certificado" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Certificado digital A1 (e-CNPJ)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {temCertificado && empresa ? (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3 text-sm">
              <div className="space-y-1">
                <p className="font-medium break-words">{empresa.certificadoTitular}</p>
                <p className="text-muted-foreground">
                  {empresa.certificadoCnpj ? `CNPJ ${rotuloCnpj(empresa.certificadoCnpj)} · ` : ""}
                  válido até {validade ? formatarData(validade) : "—"}
                  {empresa.certificadoEnviadoEm && ` · enviado em ${formatarData(empresa.certificadoEnviadoEm)}`}
                </p>
                {dias !== null && dias <= 0 ? (
                  <StatusBadge estado="vencido">Vencido</StatusBadge>
                ) : dias !== null && dias <= DIAS_AVISO_CERTIFICADO ? (
                  <StatusBadge estado="atencao">Vence em {dias} dia(s)</StatusBadge>
                ) : (
                  <StatusBadge estado="no-prazo">Em dia</StatusBadge>
                )}
              </div>
              <ConfirmButton
                action={removerCertificado}
                mensagem="Remover o certificado? A captura de NF-e na Sefaz será desligada."
                variant="ghost"
              >
                <Trash2 className="size-4" /> Remover
              </ConfirmButton>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-dashed p-3 text-sm">
              <p className="font-medium">Nenhum certificado enviado.</p>
              <p className="text-muted-foreground">
                A Sefaz só libera a consulta das NF-e emitidas contra a empresa com o certificado digital{" "}
                <strong>e-CNPJ do tipo A1</strong> (arquivo .pfx). Ele é comprado de uma Autoridade Certificadora da
                ICP-Brasil (Certisign, Serasa, Valid, Soluti, entre outras), custa em média R$ 150 a R$ 300 por ano e
                é emitido em nome do representante legal. Se a empresa já emite nota fiscal, o contador provavelmente tem um.
              </p>
            </div>
          )}

          <CertificadoForm substituir={temCertificado} desabilitado={!empresa} />
          {!empresa && <p className="text-sm text-muted-foreground">Salve os dados da empresa para poder enviar o certificado.</p>}
          <p className="text-xs text-muted-foreground">
            O arquivo é conferido na hora (senha, validade e CNPJ) e guardado cifrado (AES-256). A senha não é
            guardada. Só o Admin vê esta tela.
          </p>
        </CardContent>
      </Card>

      <Card id="secao-captura" className="scroll-mt-24">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Captura de NF-e na Sefaz</CardTitle>
          <Button variant="outline" size="sm" render={<Link href="/sefaz" />}>
            <FileSearch className="size-4" /> Acompanhar a captura
          </Button>
        </CardHeader>
        <CardContent>
          {!temCertificado && (
            <p className="mb-3 text-sm text-estado-atencao-fg">Para ligar a captura, envie o certificado A1 acima.</p>
          )}
          <CapturaForm
            ativa={empresa?.capturaAtiva ?? false}
            ambiente={empresa?.ambienteSefaz ?? "HOMOLOGACAO"}
            podeLigar={temCertificado && (dias === null || dias > 0)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
