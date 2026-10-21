import type { TipoItem } from "@prisma/client";

// "Insumo" significa o mesmo na curva ABC, na dependência de fornecedor e no detalhe do fornecedor.
export function normalizarDescricao(descricao: string): string {
  return descricao.trim().toLowerCase().replace(/\s+/g, " ");
}

export type MaterialCatalogo = {
  id: string;
  nome: string;
  unidade: string;
  tipo: TipoItem;
  categoria: string | null;
};

export type ApelidoCatalogo = {
  materialId: string;
  chave: string;
  descricaoOriginal: string;
  fornecedorId: string | null;
  codigoProduto: string | null;
};

export type ItemParaVincular = { descricao: string; codigo?: string | null };

export type CandidatoMaterial = { material: MaterialCatalogo; similaridade: number };

export type CorrespondenciaItem = {
  exato: MaterialCatalogo | null;
  origem: "codigo" | "texto" | "nome" | null;
  candidatos: CandidatoMaterial[];
};

export const UNIDADES_PADRAO = ["PC", "UN", "M", "M²", "M³", "KG", "SC", "L", "RL", "BR", "CX", "PCT", "LT", "TB", "VB", "H", "DIA", "MÊS"];

export const CATEGORIAS_MATERIAL = [
  "Alvenaria e básicos",
  "Aço e ferragens",
  "Cobertura",
  "Elétrica",
  "Esquadrias e metais",
  "Ferramentas e equipamentos",
  "Gesso e forro",
  "Hidráulica",
  "Madeira",
  "Pintura e vedação",
  "Revestimento",
  "Limpeza e outros",
];

const SINONIMOS_UNIDADE: Record<string, string> = {
  PÇ: "PC",
  PEÇA: "PC",
  UNI: "UN",
  UND: "UN",
  UNID: "UN",
  UM: "UN",
  ML: "M",
  M2: "M²",
  M3: "M³",
  LITRO: "L",
  LT: "L",
  PCTE: "PCT",
  BARRA: "BR",
  SACO: "SC",
  ROLO: "RL",
  CAIXA: "CX",
};

export function normalizarUnidade(unidade: string): string {
  const u = unidade.trim().toUpperCase();
  return SINONIMOS_UNIDADE[u] ?? u;
}

// Chave estável da descrição: o mesmo texto vindo de notas diferentes cai na mesma chave.
export function chaveMaterial(descricao: string): string {
  return descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\(\s*TRIB[^)]*\)?/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/(\d) (KG|G|MM|CM|ML|L|M|V|A|W|KW|LT)\b/g, "$1$2")
    .trim();
}

const PALAVRAS_GENERICAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "COM", "PARA", "P", "C", "A", "O", "S", "NF", "UN", "PC"]);

const temDigito = (p: string) => /\d/.test(p);

export function palavrasMaterial(descricao: string): string[] {
  return chaveMaterial(descricao)
    .split(" ")
    .filter((p) => p && !PALAVRAS_GENERICAS.has(p));
}

const PENALIDADE_MEDIDA = 0.85;

// Medidas (50KG, 25MM, 4X2) distinguem produtos: cada lado com uma medida que o outro não tem (8MM × 10MM) é conflito.
export function similaridadeMaterial(a: string, b: string): number {
  return similaridadeConjuntos(new Set(palavrasMaterial(a)), new Set(palavrasMaterial(b)));
}

function similaridadeConjuntos(pa: Set<string>, pb: Set<string>): number {
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  const dice = (2 * comuns) / (pa.size + pb.size);

  const soDeA = [...pa].some((p) => temDigito(p) && !pb.has(p));
  const soDeB = [...pb].some((p) => temDigito(p) && !pa.has(p));
  return soDeA && soDeB ? dice * PENALIDADE_MEDIDA : dice;
}

export const LIMIAR_CANDIDATO = 0.5;

type IndiceMateriais = {
  porId: Map<string, MaterialCatalogo>;
  apelidoPorCodigo: Map<string, ApelidoCatalogo>;
  apelidoPorChave: Map<string, ApelidoCatalogo>;
  materialPorChave: Map<string, MaterialCatalogo>;
  palavras: { material: MaterialCatalogo; conjuntos: Set<string>[] }[];
};

const chaveCodigo = (fornecedorId: string, codigo: string) => `${fornecedorId}\u0000${codigo}`;

// Um índice por base carregada: a leitura de uma nota (ou planilha) casa todos os itens com o mesmo catálogo.
// Os arrays da base não podem ser alterados depois da primeira busca.
const indices = new WeakMap<MaterialCatalogo[], WeakMap<ApelidoCatalogo[], IndiceMateriais>>();

function indiceDe(catalogo: MaterialCatalogo[], apelidos: ApelidoCatalogo[]): IndiceMateriais {
  let porApelidos = indices.get(catalogo);
  const pronto = porApelidos?.get(apelidos);
  if (pronto) return pronto;

  // a primeira ocorrência vence, como no find
  const primeiro = <V>(mapa: Map<string, V>, chave: string, valor: V) => {
    if (!mapa.has(chave)) mapa.set(chave, valor);
  };
  const apelidoPorCodigo = new Map<string, ApelidoCatalogo>();
  const apelidoPorChave = new Map<string, ApelidoCatalogo>();
  const textosPorMaterial = new Map<string, string[]>();
  for (const a of apelidos) {
    if (a.fornecedorId && a.codigoProduto) primeiro(apelidoPorCodigo, chaveCodigo(a.fornecedorId, a.codigoProduto), a);
    primeiro(apelidoPorChave, a.chave, a);
    const l = textosPorMaterial.get(a.materialId);
    if (l) l.push(a.descricaoOriginal);
    else textosPorMaterial.set(a.materialId, [a.descricaoOriginal]);
  }
  const materialPorChave = new Map<string, MaterialCatalogo>();
  for (const m of catalogo) primeiro(materialPorChave, chaveMaterial(m.nome), m);

  const indice: IndiceMateriais = {
    porId: new Map(catalogo.map((m) => [m.id, m])),
    apelidoPorCodigo,
    apelidoPorChave,
    materialPorChave,
    palavras: catalogo.map((m) => ({
      material: m,
      conjuntos: [m.nome, ...(textosPorMaterial.get(m.id) ?? [])].map((t) => new Set(palavrasMaterial(t))),
    })),
  };
  if (!porApelidos) indices.set(catalogo, (porApelidos = new WeakMap()));
  porApelidos.set(apelidos, indice);
  return indice;
}

// limite 0 dispensa a busca aproximada (só interessa a ligação exata)
export function correspondenciaItem(
  item: ItemParaVincular,
  base: { catalogo: MaterialCatalogo[]; apelidos: ApelidoCatalogo[]; fornecedorId?: string | null },
  limite = 5,
): CorrespondenciaItem {
  const indice = indiceDe(base.catalogo, base.apelidos);
  const achar = (id: string) => indice.porId.get(id) ?? null;

  const codigo = item.codigo?.trim();
  if (codigo && base.fornecedorId) {
    const a = indice.apelidoPorCodigo.get(chaveCodigo(base.fornecedorId, codigo));
    const m = a && achar(a.materialId);
    if (m) return { exato: m, origem: "codigo", candidatos: [] };
  }

  const chave = chaveMaterial(item.descricao);
  if (chave) {
    const a = indice.apelidoPorChave.get(chave);
    const viaApelido = a && achar(a.materialId);
    if (viaApelido) return { exato: viaApelido, origem: "texto", candidatos: [] };
    const viaNome = indice.materialPorChave.get(chave);
    if (viaNome) return { exato: viaNome, origem: "nome", candidatos: [] };
  }
  if (limite <= 0) return { exato: null, origem: null, candidatos: [] };

  const doItem = new Set(palavrasMaterial(item.descricao));
  const candidatos: CandidatoMaterial[] = [];
  for (const { material, conjuntos } of indice.palavras) {
    const similaridade = Math.max(...conjuntos.map((c) => similaridadeConjuntos(doItem, c)));
    if (similaridade >= LIMIAR_CANDIDATO) candidatos.push({ material, similaridade });
  }
  candidatos.sort((x, y) => y.similaridade - x.similaridade || x.material.nome.localeCompare(y.material.nome));
  return { exato: null, origem: null, candidatos: candidatos.slice(0, limite) };
}

// Decisão por item na leitura de nota. Só "existente automático" dispensa o usuário:
// sem ligação exata o item fica "pendente" até ele ligar, cadastrar ou deixar avulso.
export type VinculoMaterial =
  | { modo: "nenhum" }
  | { modo: "existente"; id: string; automatico: boolean }
  | { modo: "novo"; nome: string; unidade: string }
  | { modo: "pendente"; candidatos: { id: string; nome: string; similaridade: number }[] };

export function vinculoInicial(correspondencia: CorrespondenciaItem | undefined, tipo: TipoItem): VinculoMaterial {
  if (tipo !== "MATERIAL") return { modo: "nenhum" };
  if (correspondencia?.exato) return { modo: "existente", id: correspondencia.exato.id, automatico: true };
  return {
    modo: "pendente",
    candidatos: (correspondencia?.candidatos ?? []).map((c) => ({
      id: c.material.id,
      nome: c.material.nome,
      similaridade: c.similaridade,
    })),
  };
}

export const materialIdDoVinculo = (v: VinculoMaterial | undefined): string => (v?.modo === "existente" ? v.id : "");

export function errosDeVinculos(vinculos: (VinculoMaterial | undefined)[]): string[] {
  const erros: string[] = [];
  vinculos.forEach((v, i) => {
    if (v?.modo === "pendente") {
      erros.push(`Itens: a linha ${i + 1} precisa de um material — ligue a um existente, cadastre como novo ou deixe avulso.`);
    } else if (v?.modo === "novo") {
      if (!v.nome.trim()) erros.push(`Itens: informe o nome do novo material da linha ${i + 1}.`);
      else if (!v.unidade.trim()) erros.push(`Itens: informe a unidade do novo material da linha ${i + 1}.`);
    }
  });
  return erros;
}
