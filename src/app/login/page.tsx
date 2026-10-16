import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { LoginBloqueado, signIn, usuarioAtual } from "@/lib/auth";
import { FolhaDeAcesso, TituloCota } from "@/components/folha-de-acesso";
import { LoginForm, type AvisoDeLogin } from "./login-form";

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

  // a mensagem de erro é a mesma para e-mail inexistente, senha errada e conta desativada
  const aviso: AvisoDeLogin = erro === "bloqueado" ? "bloqueado" : erro ? "invalido" : cadastro ? "conta-criada" : senha ? "senha-trocada" : null;

  return (
    <FolhaDeAcesso>
      <TituloCota>Entrar</TituloCota>
      <p className="mt-3 text-muted-foreground">Use o e-mail e a senha do seu cadastro.</p>
      <LoginForm action={login} aviso={aviso} />
    </FolhaDeAcesso>
  );
}
