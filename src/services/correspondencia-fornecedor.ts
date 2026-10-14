/**
 * Correspondência entre o emitente lido de um documento e o cadastro de
 * fornecedores — para a mesma empresa não virar dois fornecedores (um com
 * CNPJ e outro sem, um com máscara e outro sem, matriz e filial...).
 *
 * Puro: recebe o cadastro já carregado e devolve o fornecedor exato (mesmo
 * CNPJ/CPF) e os candidatos que o usuário precisa olhar antes de cadastrar
 * um novo.
 */
import { formatarDocumento } from "./nfe-xml";
import { documentoValido } from "./leitura-documento";
export type FornecedorCadastro = { id: string; nome: string; cnpj: string | null };

export type MotivoCandidato =
  /** mesmo CNPJ raiz (8 primeiros dígitos): outra filial da mesma empresa */
  | "MESMA_EMPRESA"
  /** nome parecido e cadastrado sem CNPJ/CPF — provavelmente é o mesmo, falta completar o documento */
  | "NOME_SEM_DOCUMENTO"
  /** nome parecido com CNPJ/CPF diferente — pode ser outra empresa ou documento mal lido */
  | "NOME_DOCUMENTO_DIFERENTE";

export type CandidatoFornecedor = FornecedorCadastro & { motivo: MotivoCandidato; similaridade: number };

export type CorrespondenciaFornecedor = {
  /** fornecedor com o mesmo CNPJ/CPF (com ou sem máscara) */
  exato: FornecedorCadastro | null;
  /** quando há `exato` e o nome do cadastro é bem diferente do lido (só informativo) */
  nomeDivergente: boolean;
  candidatos: CandidatoFornecedor[];
};

const PALAVRAS_GENERICAS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "s", "a", "cia", "de", "da", "do", "das", "dos", "e", "em", "the",
]);

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Palavras relevantes do nome: sem acento, minúsculas, sem sufixos societários. */
export function palavrasDoNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p && !PALAVRAS_GENERICAS.has(p));
}

/**
 * Similaridade de 0 a 1 entre dois nomes de empresa (Dice sobre as palavras).
 * Quando todas as palavras do nome mais curto estão no mais longo — "Casa do
 * Construtor" × "Casa do Construtor Materiais Ltda" — vale ao menos 0,8.
 */
export function similaridadeNomes(a: string, b: string): number {
  const pa = new Set(palavrasDoNome(a));
  const pb = new Set(palavrasDoNome(b));
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  const dice = (2 * comuns) / (pa.size + pb.size);
  const [menor, maior] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
  const contido = [...menor].every((p) => maior.has(p)) && [...menor].some((p) => p.length >= 4);
  return contido ? Math.max(dice, 0.8) : dice;
}

const LIMIAR_SEM_DOCUMENTO = 0.6;
const LIMIAR_DOCUMENTO_DIFERENTE = 0.75;
const ORDEM: Record<MotivoCandidato, number> = { MESMA_EMPRESA: 0, NOME_SEM_DOCUMENTO: 1, NOME_DOCUMENTO_DIFERENTE: 2 };

export function correspondenciaFornecedor(
  lido: { nome: string | null; documento: string | null },
  cadastro: FornecedorCadastro[],
  limite = 5,
): CorrespondenciaFornecedor {
  const doc = digitos(lido.documento);
  const nome = lido.nome ?? "";

  const exato = doc ? (cadastro.find((f) => digitos(f.cnpj) === doc) ?? null) : null;
  if (exato) {
    return {
      exato,
      nomeDivergente: !!nome && similaridadeNomes(nome, exato.nome) < LIMIAR_SEM_DOCUMENTO,
      candidatos: [],
    };
  }

  const candidatos: CandidatoFornecedor[] = [];
  for (const f of cadastro) {
    const docF = digitos(f.cnpj);
    const similaridade = nome ? similaridadeNomes(nome, f.nome) : 0;
    let motivo: MotivoCandidato | null = null;
    if (doc.length === 14 && docF.length === 14 && docF.slice(0, 8) === doc.slice(0, 8)) motivo = "MESMA_EMPRESA";
    else if (!docF && similaridade >= LIMIAR_SEM_DOCUMENTO) motivo = "NOME_SEM_DOCUMENTO";
    else if (docF && similaridade >= (doc ? LIMIAR_DOCUMENTO_DIFERENTE : LIMIAR_SEM_DOCUMENTO)) {
      motivo = "NOME_DOCUMENTO_DIFERENTE";
    }
    if (motivo) candidatos.push({ ...f, motivo, similaridade });
  }
  candidatos.sort((x, y) => ORDEM[x.motivo] - ORDEM[y.motivo] || y.similaridade - x.similaridade);
  return { exato: null, nomeDivergente: false, candidatos: candidatos.slice(0, limite) };
}

export const MOTIVO_CANDIDATO_LABEL: Record<MotivoCandidato, string> = {
  MESMA_EMPRESA: "mesma empresa, outra filial (CNPJ raiz igual)",
  NOME_SEM_DOCUMENTO: "nome parecido, cadastrado sem CNPJ/CPF",
  NOME_DOCUMENTO_DIFERENTE: "nome parecido, com outro CNPJ/CPF",
};

/**
 * O destinatário/tomador é a própria empresa? Compara com a lista de CNPJs da
 * empresa (`CNPJS_EMPRESA`), aceitando filiais (mesmo CNPJ raiz). `null`
 * quando a lista não foi configurada ou o documento não foi lido.
 */
export function destinatarioEhEmpresa(documento: string | null, cnpjsEmpresa: string[]): boolean | null {
  const doc = digitos(documento);
  const lista = cnpjsEmpresa.map(digitos).filter(Boolean);
  if (!doc || lista.length === 0) return null;
  return lista.some((c) => c === doc || (c.length === 14 && doc.length === 14 && c.slice(0, 8) === doc.slice(0, 8)));
}

/** CNPJs da empresa configurados no ambiente (separados por vírgula, ponto e vírgula ou espaço). */
export function lerCnpjsEmpresa(valor: string | undefined): string[] {
  return (valor ?? "").split(/[,;\s]+/).map(digitos).filter(Boolean);
}

/**
 * CNPJ/CPF digitado ou lido, pronto para o cadastro: confere os dígitos
 * verificadores e devolve com máscara (o formato que o cadastro usa).
 */
export function normalizarDocumentoCadastro(valor: string): { ok: true; valor: string } | { ok: false; erro: string } {
  const d = digitos(valor);
  if (d.length !== 11 && d.length !== 14) {
    return { ok: false, erro: "CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos)" };
  }
  if (!documentoValido(d)) {
    return { ok: false, erro: `${d.length === 14 ? "CNPJ" : "CPF"} inválido — confira os dígitos` };
  }
  return { ok: true, valor: formatarDocumento(d) };
}
