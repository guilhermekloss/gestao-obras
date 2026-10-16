import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut, usuarioAtual } from "@/lib/auth";
import { COOKIE_TEMA, lerTema } from "@/lib/tema";
import { ROLE_LABELS } from "@/services/acesso";
import { Sidebar, BottomNav, TituloDaPagina } from "@/components/nav";
import { BotaoTema } from "@/components/botao-tema";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LogOut, UserRound } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // lido do banco: conta desativada perde o acesso na hora
  const user = await usuarioAtual();
  if (!user) redirect("/login");

  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);

  async function sair() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-svh">
      <a
        href="#conteudo"
        className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Ir para o conteúdo
      </a>
      <Sidebar role={user.role} usuario={{ nome: user.nome, papel: ROLE_LABELS[user.role] }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-card px-4">
          <TituloDaPagina />
          <div className="flex shrink-0 items-center gap-1">
            <BotaoTema inicial={tema} />
            <Button variant="ghost" size="sm" render={<Link href="/conta" />} aria-label="Minha conta">
              <UserRound className="size-4" />
              <span className="hidden md:inline">Minha conta</span>
            </Button>
            <form action={sair}>
              <Button variant="ghost" size="sm" type="submit" aria-label="Sair">
                <LogOut className="size-4" />
                <span className="hidden md:inline">Sair</span>
              </Button>
            </form>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="flex-1 p-4 pb-28 outline-none md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav role={user.role} />
      <Toaster />
    </div>
  );
}
