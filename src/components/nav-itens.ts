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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  papeis: Role[];
  /** Fica na barra inferior do celular; os demais vão para "Mais". */
  fixo?: boolean;
};

export const ITENS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, papeis: ["ADMIN", "ESCRITORIO"], fixo: true },
  { href: "/obras", label: "Obras", icon: Building2, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"] },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck, papeis: ["ADMIN", "ESCRITORIO"] },
  { href: "/materiais", label: "Materiais", icon: Package, papeis: ["ADMIN", "ESCRITORIO"] },
  { href: "/notas", label: "Lançamentos", icon: ReceiptText, papeis: ["ADMIN", "ESCRITORIO"], fixo: true },
  { href: "/contas", label: "Contas a pagar", icon: CalendarClock, papeis: ["ADMIN", "ESCRITORIO"], fixo: true },
  { href: "/diario", label: "Diário de obra", icon: NotebookPen, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], fixo: true },
  { href: "/cronograma", label: "Cronograma", icon: ChartGantt, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"] },
  { href: "/orcamento", label: "Orçamento", icon: PiggyBank, papeis: ["ADMIN", "ESCRITORIO"] },
  { href: "/usuarios", label: "Usuários", icon: Users, papeis: ["ADMIN"] },
  { href: "/empresa", label: "Empresa", icon: Landmark, papeis: ["ADMIN"] },
  { href: "/sefaz", label: "Captura Sefaz", icon: FileSearch, papeis: ["ADMIN"] },
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

/** Até 4 itens cabem na barra; passando disso, 4 ficam e o resto vai para "Mais". */
export function dividirBarra(itens: NavItem[]) {
  if (itens.length <= MAX_NA_BARRA) return { barra: itens, mais: [] as NavItem[] };
  const barra = itens.filter((i) => i.fixo).slice(0, MAX_NA_BARRA);
  return { barra, mais: itens.filter((i) => !barra.includes(i)) };
}
