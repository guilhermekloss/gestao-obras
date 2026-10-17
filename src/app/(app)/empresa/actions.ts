"use server";

import { prisma } from "@/lib/prisma";
import { acaoDeEscrita, type ActionResult } from "@/lib/acao";
import { anotarAtividade } from "@/lib/atividade";
import { cifrar } from "@/lib/cofre";
import { ID_EMPRESA, carregarEmpresa, empresaSchema } from "@/services/empresa";
import { MAX_BYTES_PFX, prepararCertificado } from "@/services/sefaz/pfx";

export type EstadoForm = ActionResult & { mensagem?: string };

const REVALIDAR = ["/empresa", "/sefaz", "/dashboard"];

export const salvarEmpresa = acaoDeEscrita(
  { papeis: ["ADMIN"], atividade: "empresa.editar", revalidar: REVALIDAR },
  async (_usuario, _anterior: EstadoForm, form: FormData): Promise<EstadoForm> => {
    const r = empresaSchema.safeParse({
      razaoSocial: form.get("razaoSocial") ?? "",
      nomeFantasia: form.get("nomeFantasia") ?? "",
      cnpj: form.get("cnpj") ?? "",
      filiais: form.get("filiais") ?? "",
      uf: form.get("uf") ?? "",
    });
    if (!r.success) return { ok: false, erro: r.error.issues[0].message };
    const atual = await carregarEmpresa();
    // trocar a matriz para outra raiz invalida o certificado guardado: ele é da empresa antiga
    if (atual?.certificadoCnpj && atual.certificadoCnpj.slice(0, 8) !== r.data.cnpj.slice(0, 8)) {
      return { ok: false, erro: "O certificado guardado é de outro CNPJ. Remova o certificado antes de trocar o CNPJ da matriz." };
    }
    await prisma.empresa.upsert({ where: { id: ID_EMPRESA }, create: { id: ID_EMPRESA, ...r.data }, update: r.data });
    anotarAtividade({ descricao: `Atualizou os dados da empresa (${r.data.razaoSocial})` });
    return { ok: true, mensagem: "Dados da empresa salvos." };
  },
);

export const enviarCertificado = acaoDeEscrita(
  { papeis: ["ADMIN"], atividade: "empresa.certificado", revalidar: REVALIDAR },
  async (usuario, _anterior: EstadoForm, form: FormData): Promise<EstadoForm> => {
    const empresa = await carregarEmpresa();
    if (!empresa) return { ok: false, erro: "Salve os dados da empresa antes de enviar o certificado." };
    const arquivo = form.get("arquivo");
    const senha = String(form.get("senha") ?? "");
    if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Escolha o arquivo .pfx ou .p12 do certificado." };
    if (arquivo.size > MAX_BYTES_PFX) return { ok: false, erro: "Arquivo grande demais para um certificado A1." };
    if (!senha) return { ok: false, erro: "Informe a senha do certificado." };

    const r = await prepararCertificado(Buffer.from(await arquivo.arrayBuffer()), senha, empresa.cnpj);
    if (!r.ok) return { ok: false, erro: r.erro };
    const c = r.certificado;
    await prisma.empresa.update({
      where: { id: ID_EMPRESA },
      data: {
        certificadoCifrado: cifrar(c.pem),
        certificadoTitular: c.titular,
        certificadoCnpj: c.cnpj,
        certificadoEmissor: c.emissor,
        certificadoValidoDesde: c.validoDesde,
        certificadoValidoAte: c.validoAte,
        certificadoEnviadoEm: new Date(),
        certificadoEnviadoPorId: usuario.id,
      },
    });
    anotarAtividade({ descricao: `Enviou o certificado A1 (${c.titular}), válido até ${c.validoAte.toLocaleDateString("pt-BR")}` });
    return { ok: true, mensagem: "Certificado guardado com segurança." };
  },
);

export const removerCertificado = acaoDeEscrita(
  { papeis: ["ADMIN"], atividade: "empresa.certificado", revalidar: REVALIDAR },
  async (): Promise<ActionResult> => {
    await prisma.empresa.updateMany({
      where: { id: ID_EMPRESA },
      data: {
        certificadoCifrado: null,
        certificadoTitular: null,
        certificadoCnpj: null,
        certificadoEmissor: null,
        certificadoValidoDesde: null,
        certificadoValidoAte: null,
        certificadoEnviadoEm: null,
        certificadoEnviadoPorId: null,
        capturaAtiva: false,
      },
    });
    anotarAtividade({ descricao: "Removeu o certificado A1 e desligou a captura de NF-e" });
    return { ok: true };
  },
);

export const configurarCaptura = acaoDeEscrita(
  { papeis: ["ADMIN"], atividade: "empresa.captura", revalidar: REVALIDAR },
  async (_usuario, _anterior: EstadoForm, form: FormData): Promise<EstadoForm> => {
    const ativa = form.get("ativa") === "on";
    const ambiente = form.get("ambiente") === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";
    const empresa = await carregarEmpresa();
    if (!empresa) return { ok: false, erro: "Salve os dados da empresa primeiro." };
    if (ativa && !empresa.certificadoCifrado) return { ok: false, erro: "Envie o certificado A1 antes de ligar a captura." };
    if (ativa && empresa.certificadoValidoAte && empresa.certificadoValidoAte <= new Date()) {
      return { ok: false, erro: "O certificado guardado está vencido. Envie o novo antes de ligar a captura." };
    }
    await prisma.empresa.update({ where: { id: ID_EMPRESA }, data: { capturaAtiva: ativa, ambienteSefaz: ambiente } });
    anotarAtividade({
      descricao: ativa
        ? `Ligou a captura de NF-e na Sefaz (${ambiente === "PRODUCAO" ? "produção" : "homologação"})`
        : "Desligou a captura de NF-e na Sefaz",
    });
    return { ok: true, mensagem: ativa ? "Captura ligada. A primeira consulta sai em até 20 minutos." : "Captura desligada." };
  },
);
