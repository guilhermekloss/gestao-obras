import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { cookies } from "next/headers";
import { BARRA_NAVEGADOR, COOKIE_TEMA, lerTema } from "@/lib/tema";
import "./globals.css";

// Uma família só: a largura (wdth) separa títulos (112), texto (100) e números (80).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: { default: "Gestão de Obras", template: "%s · Gestão de Obras" },
  description: "Notas fiscais, contas a pagar, RDO e medições das obras",
  appleWebApp: {
    capable: true,
    title: "Obras",
    statusBarStyle: "default",
  },
};

// a barra do navegador acompanha o tema escolhido (cookie), não o do sistema
export async function generateViewport(): Promise<Viewport> {
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: BARRA_NAVEGADOR[tema],
    colorScheme: tema === "escuro" ? "dark" : "light",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} h-full antialiased${tema === "escuro" ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
