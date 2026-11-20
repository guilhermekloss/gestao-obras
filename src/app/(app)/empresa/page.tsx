import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, ShieldCheck, Trash2 } from "lucide-react";
import { exigirPapel } from "@/lib/auth";
import { formatarData } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UFS, carregarEmpresa, carregarRegimeIbsCbs, rotuloCnpj } from "@/services/empresa";
import { DIAS_AVISO_CERTIFICADO } from "@/services/sefaz/painel";
import { removerCertificado } from "./actions";
import { CapturaForm, CertificadoForm, DadosEmpresaForm, RegimeIbsCbsForm } from "./formularios";
import { GuiaCertificado } from "./guia-certificado";

export const metadata: Metadata = { title: "Empresa" };

export default async function EmpresaPage() {
  await exigirPapel("ADMIN");
  const [empresa, regimeIbsCbs] = await Promise.all([carregarEmpresa(), carregarRegimeIbsCbs()]);
  const agora = new Date();
  const validade = empresa?.certificadoValidoAte ?? null;
  const dias = validade ? Math.ceil((validade.getTime() - agora.getTime()) / 86_400_000) : null;
  const temCertificado = Boolean(empresa?.certificadoCifrado);
  const renovarEm = validade ? new Date(validade.getTime() - DIAS_AVISO_CERTIFICADO * 86_400_000) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Dados da empresa dona da plataforma, a apuração de IBS/CBS, o certificado digital e a busca automática de NF-e na Sefaz.
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

      <Card id="secao-ibs-cbs" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Reforma tributária (IBS/CBS)</CardTitle>
        </CardHeader>
        <CardContent>
          <RegimeIbsCbsForm regime={regimeIbsCbs} desabilitado={!empresa} />
          {!empresa && <p className="mt-3 text-sm text-muted-foreground">Salve os dados da empresa para informar a apuração.</p>}
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
            <div className="space-y-3 rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium break-words">{empresa.certificadoTitular}</p>
                  {dias !== null && dias <= 0 ? (
                    <StatusBadge estado="vencido">Vencido: a captura parou</StatusBadge>
                  ) : dias !== null && dias <= DIAS_AVISO_CERTIFICADO ? (
                    <StatusBadge estado="atencao">Vence em {dias} dia(s): renove já</StatusBadge>
                  ) : (
                    <StatusBadge estado="no-prazo">Em dia{dias !== null ? `: faltam ${dias} dias` : ""}</StatusBadge>
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
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <Dado rotulo="Tipo">e-CNPJ A1 (ICP-Brasil)</Dado>
                <Dado rotulo="CNPJ do certificado">{empresa.certificadoCnpj ? rotuloCnpj(empresa.certificadoCnpj) : "—"}</Dado>
                <Dado rotulo="Emitido por">{empresa.certificadoEmissor ?? "—"}</Dado>
                <Dado rotulo="Válido de">
                  {empresa.certificadoValidoDesde ? formatarData(empresa.certificadoValidoDesde) : "—"} até{" "}
                  <strong className="text-foreground">{validade ? formatarData(validade) : "—"}</strong>
                </Dado>
                <Dado rotulo="Renovar a partir de">{renovarEm ? formatarData(renovarEm) : "—"}</Dado>
                <Dado rotulo="Enviado em">{empresa.certificadoEnviadoEm ? formatarData(empresa.certificadoEnviadoEm) : "—"}</Dado>
              </dl>
            </div>
          ) : (
            <div className="space-y-1 rounded-xl border border-dashed p-3 text-sm">
              <p className="font-medium">Nenhum certificado enviado.</p>
              <p className="text-muted-foreground">
                A busca de NF-e na Sefaz precisa do certificado digital <strong>e-CNPJ A1</strong> da empresa. Veja abaixo o
                que ele precisa ter e como pedir.
              </p>
            </div>
          )}

          <GuiaCertificado aberto={!temCertificado} />

          <CertificadoForm substituir={temCertificado} desabilitado={!empresa} />
          {!empresa && <p className="text-sm text-muted-foreground">Salve os dados da empresa para poder enviar o certificado.</p>}
          <p className="text-xs text-muted-foreground">
            O arquivo é conferido na hora (senha, validade, tipo e-CNPJ e CNPJ da empresa) e guardado cifrado
            (AES-256). A senha não é guardada. Só o Admin vê esta tela.
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
            frequencia={empresa?.frequenciaCaptura ?? "UMA_VEZ_DIA"}
            podeLigar={temCertificado && (dias === null || dias > 0)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
