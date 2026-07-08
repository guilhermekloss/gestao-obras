import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Sidebar, BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LogOut } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  async function sair() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-svh">
      <Sidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <span className="font-semibold md:hidden">Gestão de Obras</span>
          <span className="hidden text-sm text-muted-foreground md:block">
            {session.user.nome} · {session.user.role.toLowerCase()}
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
      <BottomNav role={session.user.role} />
      <Toaster />
    </div>
  );
}
