import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { LoginBloqueado, signIn, usuarioAtual } from "@/lib/auth";
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
  searchParams: Promise<{ erro?: string; cadastro?: string; senha?: string }>;
}) {
  // conta desativada com cookie ainda válido cai aqui sem loop de redirecionamento
  if (await usuarioAtual()) redirect("/dashboard");

  const { erro, cadastro, senha } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        senha: formData.get("senha"),
        redirectTo: "/dashboard",
      });
    } catch (e) {
      if (e instanceof LoginBloqueado) redirect("/login?erro=bloqueado");
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
                maxLength={1024}
                autoComplete="current-password"
              />
            </div>
            {cadastro && !erro && (
              <p className="text-sm text-muted-foreground">Conta criada! Entre com seu e-mail e senha.</p>
            )}
            {senha && !erro && (
              <p className="text-sm text-muted-foreground">Senha alterada. Entre de novo com a senha nova.</p>
            )}
            {erro === "bloqueado" ? (
              <p className="text-sm text-destructive" role="alert">
                Muitas tentativas sem sucesso. Por segurança, aguarde 15 minutos e tente de novo.
              </p>
            ) : erro ? (
              <p className="text-sm text-destructive" role="alert">
                E-mail ou senha inválidos.
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
