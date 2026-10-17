import { z } from "zod";
import type { Empresa } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documentoValido } from "./leitura-documento";
import { formatarDocumento } from "./nfe-xml";
import { normalizarCnpj } from "./sefaz/xml";

export const ID_EMPRESA = "principal";

/** Código IBGE da UF: é o cUFAutor da consulta à Sefaz. */
export const UFS: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53", ES: "32", GO: "52",
  MA: "21", MT: "51", MS: "50", MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22",
  RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

const cnpjCampo = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform(normalizarCnpj)
    .refine((v) => v.length === 14, `${rotulo}: informe os 14 caracteres do CNPJ`)
    // o alfanumérico (com letras) ainda não tem dígito verificador conferido aqui
    .refine((v) => /[A-Z]/.test(v) || documentoValido(v), `${rotulo}: CNPJ inválido, confira os dígitos`);

export const empresaSchema = z
  .object({
    razaoSocial: z.string().trim().min(2, "Informe a razão social").max(200),
    nomeFantasia: z.string().trim().max(200).optional().transform((v) => v || null),
    cnpj: cnpjCampo("CNPJ da matriz"),
    filiais: z
      .string()
      .max(2000)
      .optional()
      .transform((v) => (v ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)),
    uf: z.string().refine((v) => v in UFS, "Escolha a UF"),
  })
  .transform((d, ctx) => {
    const filiais: string[] = [];
    for (const f of d.filiais) {
      const r = cnpjCampo("Filial").safeParse(f);
      if (!r.success) {
        ctx.addIssue({ code: "custom", message: `${r.error.issues[0].message} (${f})` });
        return z.NEVER;
      }
      if (r.data !== d.cnpj && !filiais.includes(r.data)) filiais.push(r.data);
    }
    return { ...d, filiais };
  });

export type DadosEmpresa = z.infer<typeof empresaSchema>;

export async function carregarEmpresa(): Promise<Empresa | null> {
  return prisma.empresa.findUnique({ where: { id: ID_EMPRESA } });
}

/** CNPJs da empresa (matriz primeiro). Sem cadastro, vale a variável CNPJS_EMPRESA da instalação antiga. */
export function cnpjsDe(empresa: Pick<Empresa, "cnpj" | "filiais"> | null, env: Record<string, string | undefined> = process.env): string[] {
  if (empresa) return [empresa.cnpj, ...empresa.filiais];
  return (env.CNPJS_EMPRESA ?? "").split(/[,;\s]+/).map(normalizarCnpj).filter(Boolean);
}

export async function cnpjsDaEmpresa(): Promise<string[]> {
  return cnpjsDe(await carregarEmpresa());
}

export function rotuloCnpj(cnpj: string): string {
  return /^\d{14}$/.test(cnpj) ? formatarDocumento(cnpj) : cnpj;
}
