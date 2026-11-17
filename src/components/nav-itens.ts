import type { Role } from "@prisma/client";
import {
  LayoutDashboard,
  Building2,
  Truck,
  Package,
  ReceiptText,
  CalendarClock,
  NotebookPen,
  ChartGantt,
  PiggyBank,
  Users,
  UserRound,
  FileSearch,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export const GRUPOS = ["Visão geral", "Obra", "Financeiro", "Cadastros", "Administração"] as const;
export type Grupo = (typeof GRUPOS)[number];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  papeis: Role[];
  /** Seção do menu lateral e da folha "Mais". */
  grupo: Grupo;
  /** Fica na barra inferior do celular; os demais vão para "Mais". */
  fixo?: boolean;
};

// Na ordem do menu: o dia a dia da obra primeiro, depois o dinheiro, depois os cadastros.
export const ITENS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, papeis: ["ADMIN", "ESCRITORIO"], grupo: "Visão geral", fixo: true },
  { href: "/obras", label: "Obras", icon: Building2, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], grupo: "Obra" },
  { href: "/diario", label: "Diário de obra", icon: NotebookPen, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], grupo: "Obra", fixo: true },
  { href: "/cronograma", label: "Cronograma", icon: ChartGantt, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], grupo: "Obra" },
  { href: "/notas", label: "Lançamentos", icon: ReceiptText, papeis: ["ADMIN", "ESCRITORIO"], grupo: "Financeiro", fixo: true },
  { href: "/contas", label: "Contas a pagar", icon: CalendarClock, papeis: ["ADMIN", "ESCRITORIO"], grupo: "Financeiro", fixo: true },
  { href: "/orcamento", label: "Orçamento", icon: PiggyBank, papeis: ["ADMIN", "ESCRITORIO"], grupo: "Financeiro" },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck, papeis: ["ADMIN", "ESCRITORIO"], grupo: "Cadastros" },
  { href: "/materiais", label: "Materiais", icon: Package, papeis: ["ADMIN", "ESCRITORIO"], grupo: "Cadastros" },
  { href: "/usuarios", label: "Usuários", icon: Users, papeis: ["ADMIN"], grupo: "Administração" },
  { href: "/empresa", label: "Empresa", icon: Landmark, papeis: ["ADMIN"], grupo: "Administração" },
  { href: "/sefaz", label: "Captura Sefaz", icon: FileSearch, papeis: ["ADMIN"], grupo: "Administração" },
];

// páginas sem item no menu, mas com título no cabeçalho
const EXTRAS: Pick<NavItem, "href" | "label" | "icon">[] = [
  { href: "/conta", label: "Minha conta", icon: UserRound },
];

export const TITULOS = [...ITENS, ...EXTRAS];

const MAX_NA_BARRA = 4;

export function itensPara(role: Role) {
  return ITENS.filter((i) => i.papeis.includes(role));
}

export function naRota(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Itens em seções, na ordem de `GRUPOS`; seção sem item para o papel não aparece. */
export function agrupar<T extends { grupo: Grupo }>(itens: T[]): { grupo: Grupo; itens: T[] }[] {
  return GRUPOS.map((grupo) => ({ grupo, itens: itens.filter((i) => i.grupo === grupo) })).filter((g) => g.itens.length > 0);
}

/** Até 4 itens cabem na barra; passando disso, 4 ficam e o resto vai para "Mais". */
export function dividirBarra(itens: NavItem[]) {
  if (itens.length <= MAX_NA_BARRA) return { barra: itens, mais: [] as NavItem[] };
  const fixos = itens.filter((i) => i.fixo).slice(0, MAX_NA_BARRA);
  // o diário fecha a barra: é o polegar de quem está na obra
  const barra = [...fixos.filter((i) => i.href !== "/diario"), ...fixos.filter((i) => i.href === "/diario")];
  return { barra, mais: itens.filter((i) => !barra.includes(i)) };
}
