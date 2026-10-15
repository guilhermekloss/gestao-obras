import type { CondicaoTrabalho, Role } from "@prisma/client";
import { urlArquivoValida } from "./arquivos";

/**
 * Regras do RDO (diário de obra). Funções puras: normalização dos campos Json
 * (efetivo e equipamentos), rótulos de clima/condição e permissão de edição.
 */

export type EfetivoItem = { funcao: string; qtd: number };
export type EquipamentoItem = { nome: string; qtd: number };

/** Valores gravados em `climaManha`/`climaTarde`. A coluna é String, então valores fora da lista são exibidos como vieram. */
export const CLIMAS = ["SOL", "NUBLADO", "CHUVA", "CHUVA_FORTE"] as const;
export type Clima = (typeof CLIMAS)[number];

const ROTULO_CLIMA: Record<Clima, string> = {
  SOL: "Sol",
  NUBLADO: "Nublado",
  CHUVA: "Chuva",
  CHUVA_FORTE: "Chuva forte",
};

export const CONDICOES: CondicaoTrabalho[] = ["PRATICAVEL", "PARCIAL", "IMPRATICAVEL"];

const ROTULO_CONDICAO: Record<CondicaoTrabalho, string> = {
  PRATICAVEL: "Praticável",
  PARCIAL: "Parcialmente praticável",
  IMPRATICAVEL: "Impraticável",
};

/** Prazo, em dias desde a criação, em que o CAMPO ainda pode editar/excluir o próprio RDO. */
export const PRAZO_EDICAO_CAMPO_DIAS = 7;

const MAX_QTD = 999;

export function ehClima(valor: string): valor is Clima {
  return (CLIMAS as readonly string[]).includes(valor);
}

/** Rótulo do clima de um turno. Vazio → null; valor desconhecido → o próprio valor. */
export function rotuloClima(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return ehClima(valor) ? ROTULO_CLIMA[valor] : valor;
}

export function rotuloCondicao(valor: CondicaoTrabalho | null | undefined): string | null {
  return valor ? ROTULO_CONDICAO[valor] : null;
}

/**
 * Resumo do clima do dia para listagens. Usa os turnos quando preenchidos
 * ("Manhã: Sol · Tarde: Chuva", ou só "Sol" se os dois forem iguais) e cai
 * no texto livre legado (`clima`) para RDOs antigos.
 */
export function resumoClima(rdo: {
  clima?: string | null;
  climaManha?: string | null;
  climaTarde?: string | null;
}): string | null {
  const manha = rotuloClima(rdo.climaManha);
  const tarde = rotuloClima(rdo.climaTarde);
  if (manha && tarde) return manha === tarde ? manha : `Manhã: ${manha} · Tarde: ${tarde}`;
  if (manha) return `Manhã: ${manha}`;
  if (tarde) return `Tarde: ${tarde}`;
  return rdo.clima?.trim() || null;
}

/**
 * Normaliza uma lista `[{<chave>, qtd}]` vinda do Json do banco ou do
 * formulário: descarta entradas malformadas, nome vazio e quantidade não
 * positiva; apara espaços; trunca quantidades fracionárias; e soma
 * duplicadas (comparação sem caixa/acentos), mantendo a grafia da primeira.
 */
function normalizarLista<K extends string>(json: unknown, chave: K): ({ [P in K]: string } & { qtd: number })[] {
  if (!Array.isArray(json)) return [];
  const porNome = new Map<string, { nome: string; qtd: number }>();
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const bruto = (item as Record<string, unknown>)[chave];
    const qtdBruta = (item as Record<string, unknown>).qtd;
    if (typeof bruto !== "string") continue;
    const nome = bruto.trim().replace(/\s+/g, " ");
    const qtd = typeof qtdBruta === "number" ? qtdBruta : Number(qtdBruta);
    if (!nome || !Number.isFinite(qtd)) continue;
    const inteiro = Math.trunc(qtd);
    if (inteiro <= 0) continue;
    const k = chaveComparacao(nome);
    const atual = porNome.get(k);
    if (atual) atual.qtd += inteiro;
    else porNome.set(k, { nome, qtd: inteiro });
  }
  return [...porNome.values()].map(
    (e) => ({ [chave]: e.nome, qtd: e.qtd }) as { [P in K]: string } & { qtd: number },
  );
}

function chaveComparacao(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Efetivo (`[{funcao, qtd}]`) normalizado a partir do Json — tolerante a dados antigos/malformados. */
export function normalizarEfetivo(json: unknown): EfetivoItem[] {
  return normalizarLista(json, "funcao");
}

/** Equipamentos (`[{nome, qtd}]`) normalizados a partir do Json. */
export function normalizarEquipamentos(json: unknown): EquipamentoItem[] {
  return normalizarLista(json, "nome");
}

type Validacao<T> = { ok: true; itens: T[] } | { ok: false; erro: string };

/**
 * Validação estrita para gravação: diferente da normalização (que tolera e
 * descarta), aqui entrada inválida vira erro para o usuário corrigir.
 * Itens com qtd 0 são só descartados (o contador do formulário chega a zero).
 */
function validarLista<K extends string>(
  itens: unknown,
  chave: K,
  rotulo: string,
): Validacao<{ [P in K]: string } & { qtd: number }> {
  if (itens == null) return { ok: true, itens: [] };
  if (!Array.isArray(itens)) return { ok: false, erro: `${rotulo}: formato inválido` };
  for (const item of itens) {
    const reg = (item ?? {}) as Record<string, unknown>;
    const nome = typeof reg[chave] === "string" ? (reg[chave] as string).trim() : "";
    const qtd = reg.qtd;
    if (!nome) return { ok: false, erro: `${rotulo}: informe o nome de cada item` };
    if (typeof qtd !== "number" || !Number.isInteger(qtd) || qtd < 0) {
      return { ok: false, erro: `${rotulo}: quantidade de "${nome}" deve ser um número inteiro` };
    }
    if (qtd > MAX_QTD) {
      return { ok: false, erro: `${rotulo}: quantidade de "${nome}" acima de ${MAX_QTD}` };
    }
  }
  return { ok: true, itens: normalizarLista(itens, chave) };
}

export function validarEfetivo(itens: unknown): Validacao<EfetivoItem> {
  return validarLista(itens, "funcao", "Efetivo");
}

export function validarEquipamentos(itens: unknown): Validacao<EquipamentoItem> {
  return validarLista(itens, "nome", "Equipamentos");
}

/** Total de pessoas no efetivo do dia. Aceita o Json cru do banco. */
export function totalPessoas(efetivo: unknown): number {
  return normalizarEfetivo(efetivo).reduce((acc, e) => acc + e.qtd, 0);
}

/**
 * Quem pode editar/excluir um RDO: ADMIN e ESCRITORIO sempre; CAMPO só o
 * próprio RDO e só até `PRAZO_EDICAO_CAMPO_DIAS` após a criação — o RDO é
 * registro do dia e não deve ser reescrito pelo campo semanas depois; correções
 * tardias passam pelo escritório.
 */
export function permissaoRdo(
  usuario: { id: string; role: Role },
  rdo: { autorId: string | null; createdAt: Date },
  agora: Date = new Date(),
): { ok: true } | { ok: false; erro: string } {
  if (usuario.role === "ADMIN" || usuario.role === "ESCRITORIO") return { ok: true };
  if (rdo.autorId !== usuario.id) {
    return { ok: false, erro: "Só o autor ou o escritório podem alterar este RDO" };
  }
  const limite = rdo.createdAt.getTime() + PRAZO_EDICAO_CAMPO_DIAS * 24 * 60 * 60 * 1000;
  if (agora.getTime() > limite) {
    return {
      ok: false,
      erro: `Prazo de ${PRAZO_EDICAO_CAMPO_DIAS} dias para alterar o RDO encerrado — peça ao escritório`,
    };
  }
  return { ok: true };
}

export function podeAlterarRdo(
  usuario: { id: string; role: Role },
  rdo: { autorId: string | null; createdAt: Date },
  agora?: Date,
): boolean {
  return permissaoRdo(usuario, rdo, agora).ok;
}

/**
 * `DiarioObra.data` é `@db.Date`: o Prisma devolve meia-noite UTC. Formatada
 * com componentes locais num servidor a oeste de UTC (ex.: America/Sao_Paulo),
 * viraria o dia anterior. Esta função reancora o dia civil ao meio-dia local,
 * como `inputParaData` faz na gravação.
 */
export function dataDoRdo(data: Date): Date {
  return new Date(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 12);
}

/**
 * URL de foto aceitável para gravar: só arquivo enviado pelo próprio app
 * (`/api/fotos/<nome>`). Endereço externo viraria pixel de rastreio ou link de
 * phishing no RDO aberto pelo escritório.
 */
export function urlFotoValida(url: string): boolean {
  return urlArquivoValida(url);
}

/**
 * Diferença entre as fotos gravadas e as enviadas na edição: quais registros
 * apagar e quais URLs criar. Compara por URL (o upload gera nomes únicos).
 */
export function diffFotos(
  atuais: { id: string; url: string }[],
  enviadas: { url: string; legenda?: string | null }[],
): { removerIds: string[]; criar: { url: string; legenda: string | null }[] } {
  const urlsEnviadas = new Set(enviadas.map((f) => f.url));
  const urlsAtuais = new Set(atuais.map((f) => f.url));
  const vistas = new Set<string>();
  const criar: { url: string; legenda: string | null }[] = [];
  for (const f of enviadas) {
    if (urlsAtuais.has(f.url) || vistas.has(f.url)) continue;
    vistas.add(f.url);
    criar.push({ url: f.url, legenda: f.legenda?.trim() || null });
  }
  return {
    removerIds: atuais.filter((f) => !urlsEnviadas.has(f.url)).map((f) => f.id),
    criar,
  };
}
