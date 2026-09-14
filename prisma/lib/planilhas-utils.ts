/**
 * Utilitários compartilhados para ler as planilhas históricas reais (CSV) e
 * canonicalizar nomes de fornecedor/prestador que aparecem grafados de várias
 * formas na mesma planilha (sufixos de controle, LTDA/ME, acentos...).
 *
 * Usado por `importar-fornecedores.ts` e `importar-dados-reais.ts`.
 */

/** Split CSV por ; respeitando aspas, inclusive quebras de linha dentro de campos. */
export function parseCsvBruto(texto: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let campo = "";
  let aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') {
      if (aspas && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === ";" && !aspas) {
      row.push(campo.trim());
      campo = "";
    } else if ((ch === "\n" || ch === "\r") && !aspas) {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(campo.trim());
      campo = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else campo += ch;
  }
  row.push(campo.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove sufixos de controle que a planilha usava para separar lançamentos
 * do mesmo fornecedor: "(02/25)", "(Ref ao mês 03/26)", "(SEGUNDA CARGA)",
 * "- valor da nota R$...", "LOTE 03", "REF 05/25", parêntese final.
 */
export function nomeCanonico(nome: string): string {
  let n = nome.replace(/\s+/g, " ").trim();
  if (n.includes("(") && !n.includes(")")) n += ")"; // paren não fechado na planilha
  let anterior = "";
  while (anterior !== n) {
    anterior = n;
    n = n
      .replace(/\s*-?\s*valor da nota\s*R?\$?[\d.,]*\s*$/i, "")
      .replace(/\s*\([^()]*\)\s*$/, "") // qualquer parêntese no fim
      .replace(/\s*\([^)]*$/, "") // fragmento de parêntese sem fechar (paren duplo digitado)
      .replace(/\s*REF\.?\s*(AO\s+M[EÊ]S\s*)?\d{2}\/\d{2,4}\s*$/i, "")
      .replace(/\s*LOTE\s*\d{2}\s*$/i, "")
      .replace(/\s*CPF\s*$/i, "")
      .replace(/\s*[\d.]{2,}\/?\d{0,4}-?\d{0,2}\s*$/, "") // CNPJ/CPF digitado no nome
      .replace(/[-–,\s]+$/, "")
      .trim();
  }
  return n || nome.trim();
}

/**
 * Chave de agrupamento tolerante: ignora acentos, sufixos societários
 * (LTDA, S.A., ME...) e conectivos (DE/DA/DO), para juntar grafias como
 * "NICHELE MATERIAIS" × "NICHELE MATERIAIS LTDA" e "JARDIM DE PEDRA" × "JARDIM PEDRA".
 */
export function chaveNome(nome: string): string {
  return normalizar(nomeCanonico(nome))
    .replace(/\b(LTDA|EIRELI|EPP|ME|MEI|CIA|S\.?A\.?|S\/A)\b\.?/g, " ")
    .replace(/\b(DE|DA|DO|DAS|DOS|E)\b/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}

/** CNPJ (14 dígitos) ou CPF (11) formatado; null para qualquer outra coisa. */
export function documentoValido(s: string | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return null;
}

export type RegistroFornecedor = { nome: string; doc: string | null; ocorrencias: number };

/**
 * Agrupa variantes brutas de nome de fornecedor em nomes canônicos únicos:
 * primeiro por documento (CNPJ/CPF) válido, depois por chave de nome fuzzy.
 * Documento repetido em grupos diferentes (erro de digitação) fica com o
 * grupo mais frequente; os demais entram sem documento (conflito reportado).
 *
 * Também devolve um `resolver` que, dado o nome/documento brutos de UMA
 * linha específica (de qualquer uma das planilhas), devolve o mesmo registro
 * final do grupo — necessário para que a mesma empresa fique com o texto
 * idêntico nos dois CSVs intermediários (a chave de junção item↔financeiro é
 * o texto do fornecedor).
 */
export function agruparFornecedores(variantes: RegistroFornecedor[]): {
  finais: RegistroFornecedor[];
  conflitos: string[];
  resolver: (nomeBruto: string, docBruto: string | null) => RegistroFornecedor;
} {
  const grupos = new Map<string, { nomes: Map<string, number>; doc: string | null }>();
  const docDoNome = new Map<string, string>();

  for (const v of variantes.filter((x) => x.doc)) {
    const chave = chaveNome(v.nome);
    if (!docDoNome.has(chave)) docDoNome.set(chave, v.doc!);
  }

  function chaveDaVariante(nome: string, doc: string | null): string {
    const docResolvido = doc ?? docDoNome.get(chaveNome(nome)) ?? null;
    return docResolvido ?? `nome:${chaveNome(nome)}`;
  }

  for (const v of variantes) {
    const canon = nomeCanonico(v.nome);
    const chave = chaveDaVariante(v.nome, v.doc);
    const doc = chave.startsWith("nome:") ? null : chave;
    const g = grupos.get(chave) ?? { nomes: new Map(), doc };
    g.nomes.set(canon, (g.nomes.get(canon) ?? 0) + 1);
    if (!g.doc && doc) g.doc = doc;
    grupos.set(chave, g);
  }

  const finaisBrutos = [...grupos.entries()].map(([chaveOriginal, g]) => {
    const [nome, ocorrencias] = [...g.nomes.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].length - b[0].length,
    )[0];
    const total = [...g.nomes.values()].reduce((a, b) => a + b, 0);
    const entry: RegistroFornecedor = { nome, doc: g.doc, ocorrencias: total > ocorrencias ? total : ocorrencias };
    return { chaveOriginal, entry };
  });

  const porDoc = new Map<string, { chaveOriginal: string; entry: RegistroFornecedor }[]>();
  for (const f of finaisBrutos.filter((x) => x.entry.doc)) {
    porDoc.set(f.entry.doc!, [...(porDoc.get(f.entry.doc!) ?? []), f]);
  }
  const conflitos: string[] = [];
  for (const [doc, fs] of porDoc) {
    if (fs.length <= 1) continue;
    fs.sort((a, b) => b.entry.ocorrencias - a.entry.ocorrencias);
    for (const perdedor of fs.slice(1)) {
      conflitos.push(
        `${doc} mantido em "${fs[0].entry.nome}"; "${perdedor.entry.nome}" ficou sem CNPJ — confirme o CNPJ correto`,
      );
      perdedor.entry.doc = null;
    }
  }

  // dedup final por chave de nome (grupos sem doc que colidem com grupo com doc);
  // chaveOriginalParaFinal mantém, para cada chave de grupo original, qual é
  // o registro final (possivelmente o de outro grupo, após esse dedup).
  const porNome = new Map<string, RegistroFornecedor>();
  const chaveOriginalParaFinal = new Map<string, RegistroFornecedor>();
  for (const { chaveOriginal, entry } of finaisBrutos) {
    const chaveNomeEntry = chaveNome(entry.nome);
    const existente = porNome.get(chaveNomeEntry);
    let final: RegistroFornecedor;
    if (!existente) {
      final = entry;
      porNome.set(chaveNomeEntry, final);
    } else if (!existente.doc && entry.doc) {
      final = { ...entry, ocorrencias: existente.ocorrencias + entry.ocorrencias };
      porNome.set(chaveNomeEntry, final);
    } else {
      final = existente;
    }
    chaveOriginalParaFinal.set(chaveOriginal, final);
  }

  const resolver = (nomeBruto: string, docBruto: string | null): RegistroFornecedor => {
    const chave = chaveDaVariante(nomeBruto, docBruto);
    return (
      chaveOriginalParaFinal.get(chave) ?? {
        nome: nomeCanonico(nomeBruto),
        doc: docBruto,
        ocorrencias: 1,
      }
    );
  };

  return {
    finais: [...new Set(chaveOriginalParaFinal.values())].sort((a, b) => a.nome.localeCompare(b.nome)),
    conflitos,
    resolver,
  };
}
