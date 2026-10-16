"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

export type ItemContado = { nome: string; qtd: number };

function mesmoNome(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;
}

// alvo de 48 px também em ponteiro grosso (o `Button` icon cai para 40 px lá)
const BOTAO_CONTAR = "size-12 pointer-coarse:size-12 [&_svg:not([class*='size-'])]:size-5";

export function ContadorLista({
  sugestoes,
  itens,
  onChange,
  placeholderOutro,
}: {
  sugestoes: string[];
  itens: ItemContado[];
  onChange: (itens: ItemContado[]) => void;
  placeholderOutro: string;
}) {
  const [outro, setOutro] = useState("");

  const linhas = [
    ...sugestoes,
    ...itens.map((i) => i.nome).filter((n) => !sugestoes.some((s) => mesmoNome(s, n))),
  ];

  function ajustar(nome: string, delta: number) {
    const atual = itens.find((i) => mesmoNome(i.nome, nome));
    const qtd = Math.min(999, (atual?.qtd ?? 0) + delta);
    if (qtd <= 0) return onChange(itens.filter((i) => !mesmoNome(i.nome, nome)));
    if (atual) return onChange(itens.map((i) => (i === atual ? { ...i, qtd } : i)));
    onChange([...itens, { nome, qtd }]);
  }

  function adicionarOutro() {
    const nome = outro.trim().replace(/\s+/g, " ");
    if (!nome) return;
    const sugestao = sugestoes.find((s) => mesmoNome(s, nome));
    ajustar(sugestao ?? nome, 1);
    setOutro("");
  }

  return (
    <div className="grid gap-2">
      {linhas.map((nome) => {
        const qtd = itens.find((i) => mesmoNome(i.nome, nome))?.qtd ?? 0;
        return (
          <div
            key={nome}
            className={cn(
              "flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 py-2 pr-2 pl-3",
              qtd > 0 ? "border-primary bg-nav-ativo" : "border-input bg-card",
            )}
          >
            <span className={cn("min-w-0 text-base leading-tight", qtd > 0 ? "font-semibold text-primary" : "font-medium")}>
              {nome}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={BOTAO_CONTAR}
                aria-label={`Diminuir ${nome}`}
                onClick={() => ajustar(nome, -1)}
                disabled={qtd === 0}
              >
                <Minus />
              </Button>
              <span
                role="status"
                aria-label={`${nome}: ${qtd}`}
                className="num w-10 text-center text-2xl"
              >
                {qtd}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={BOTAO_CONTAR}
                aria-label={`Aumentar ${nome}`}
                onClick={() => ajustar(nome, 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex gap-2 pt-1">
        <Input
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionarOutro();
            }
          }}
          placeholder={placeholderOutro}
          aria-label={placeholderOutro}
          className="h-14 min-w-0 flex-1"
          maxLength={60}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-14 px-4 pointer-coarse:h-14"
          onClick={adicionarOutro}
          disabled={!outro.trim()}
        >
          <Plus /> Incluir
        </Button>
      </div>
    </div>
  );
}
