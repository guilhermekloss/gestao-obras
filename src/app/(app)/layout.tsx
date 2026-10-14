import { redirect } from "next/navigation";
import { signOut, usuarioAtual } from "@/lib/auth";
import { ROLE_LABELS } from "@/services/acesso";
import { Sidebar, BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LogOut } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // lido do banco: conta desativada perde o acesso na hora, e o menu segue o papel atual
  const user = await usuarioAtual();
  if (!user) redirect("/login");

  async function sair() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-svh">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <span className="font-semibold md:hidden">Gestão de Obras</span>
          <span className="hidden text-sm text-muted-foreground md:block">
            {user.nome} · {ROLE_LABELS[user.role]}
          </span>
          <form action={sair}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="size-4" />
              <span className="hidden md:inline">Sair</span>
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <BottomNav role={user.role} />
      <Toaster />
    </div>
  );
}
