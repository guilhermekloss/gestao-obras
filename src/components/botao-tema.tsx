"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BARRA_NAVEGADOR, cookieDoTema, outroTema, type Tema } from "@/lib/tema";

// O servidor já entrega o <html> com a classe certa (cookie); aqui só se troca na hora e se grava a escolha.
export function BotaoTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial);
  const destino = outroTema(tema);
  const rotulo = destino === "escuro" ? "Usar tema escuro" : "Usar tema claro";

  function alternar() {
    document.documentElement.classList.toggle("dark", destino === "escuro");
    document.cookie = cookieDoTema(destino);
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", BARRA_NAVEGADOR[destino]));
    setTema(destino);
  }

  return (
    <Button variant="ghost" size="icon" onClick={alternar} aria-label={rotulo} title={rotulo}>
      {destino === "escuro" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
