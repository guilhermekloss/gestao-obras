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
  const pa = new Set(palavrasMaterial(a));
  const pb = new Set(palavrasMaterial(b));
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  const dice = (2 * comuns) / (pa.size + pb.size);

  const soDeA = [...pa].some((p) => temDigito(p) && !pb.has(p));
  const soDeB = [...pb].some((p) => temDigito(p) && !pa.has(p));
  return soDeA && soDeB ? dice * PENALIDADE_MEDIDA : dice;
}

export const LIMIAR_CANDIDATO = 0.5;

export function correspondenciaItem(
  item: ItemParaVincular,
  base: { catalogo: MaterialCatalogo[]; apelidos: ApelidoCatalogo[]; fornecedorId?: string | null },
  limite = 5,
): CorrespondenciaItem {
  const porId = new Map(base.catalogo.map((m) => [m.id, m]));
  const achar = (id: string) => porId.get(id) ?? null;

  const codigo = item.codigo?.trim();
  if (codigo && base.fornecedorId) {
    const a = base.apelidos.find((x) => x.fornecedorId === base.fornecedorId && x.codigoProduto === codigo);
    const m = a && achar(a.materialId);
    if (m) return { exato: m, origem: "codigo", candidatos: [] };
  }

  const chave = chaveMaterial(item.descricao);
  if (chave) {
    const a = base.apelidos.find((x) => x.chave === chave);
    const viaApelido = a && achar(a.materialId);
    if (viaApelido) return { exato: viaApelido, origem: "texto", candidatos: [] };
    const viaNome = base.catalogo.find((m) => chaveMaterial(m.nome) === chave);
    if (viaNome) return { exato: viaNome, origem: "nome", candidatos: [] };
  }

  const textosPorMaterial = new Map<string, string[]>();
  for (const a of base.apelidos) {
    const l = textosPorMaterial.get(a.materialId);
    if (l) l.push(a.descricaoOriginal);
    else textosPorMaterial.set(a.materialId, [a.descricaoOriginal]);
  }

  const candidatos: CandidatoMaterial[] = [];
  for (const m of base.catalogo) {
    const textos = [m.nome, ...(textosPorMaterial.get(m.id) ?? [])];
    const similaridade = Math.max(...textos.map((t) => similaridadeMaterial(item.descricao, t)));
    if (similaridade >= LIMIAR_CANDIDATO) candidatos.push({ material: m, similaridade });
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
