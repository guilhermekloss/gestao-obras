import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { erro } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        senha: formData.get("senha"),
        redirectTo: "/dashboard",
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?erro=1");
      throw e;
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Gestão de Obras</CardTitle>
          <CardDescription>Entre com seu e-mail e senha</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {erro && (
              <p className="text-sm text-destructive">
                E-mail ou senha inválidos.
              </p>
            )}
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
