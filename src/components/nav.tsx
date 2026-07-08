"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  LayoutDashboard,
  Building2,
  Truck,
  ReceiptText,
  CalendarClock,
  NotebookPen,
  Ruler,
  PiggyBank,
  FileUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  papeis: Role[];
  mobile?: boolean; // aparece na bottom nav
};

const ITENS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, papeis: ["ADMIN", "ESCRITORIO"], mobile: true },
  { href: "/obras", label: "Obras", icon: Building2, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], mobile: true },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck, papeis: ["ADMIN", "ESCRITORIO"] },
  { href: "/notas", label: "Notas fiscais", icon: ReceiptText, papeis: ["ADMIN", "ESCRITORIO"], mobile: true },
  { href: "/contas", label: "Contas a pagar", icon: CalendarClock, papeis: ["ADMIN", "ESCRITORIO"], mobile: true },
  { href: "/diario", label: "Diário de obra", icon: NotebookPen, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], mobile: true },
  { href: "/medicoes", label: "Medições", icon: Ruler, papeis: ["ADMIN", "ESCRITORIO", "CAMPO"], mobile: true },
  { href: "/orcamento", label: "Orçamento", icon: PiggyBank, papeis: ["ADMIN", "ESCRITORIO"] },
  { href: "/importar", label: "Importar", icon: FileUp, papeis: ["ADMIN", "ESCRITORIO"] },
  { href: "/usuarios", label: "Usuários", icon: Users, papeis: ["ADMIN"] },
];

function itensPara(role: Role, apenasMobile = false) {
  return ITENS.filter(
    (i) => i.papeis.includes(role) && (!apenasMobile || i.mobile),
  );
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="hidden w-56 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4 font-semibold">
        Gestão de Obras
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        {itensPara(role).map((item) => {
          const ativo = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                ativo
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const itens = itensPara(role, true).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {itens.map((item) => {
        const ativo = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px]",
              ativo ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.label.split(" ")[0]}
          </Link>
        );
      })}
    </nav>
  );
}
