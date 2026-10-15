"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelAjuda } from "@/components/campo-ajuda";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

export type ItemContado = { nome: string; qtd: number };

function mesmoNome(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;
}

export function ContadorLista({
  titulo,
  ajuda,
  sugestoes,
  itens,
  onChange,
  placeholderOutro,
}: {
  titulo: string;
  ajuda: string;
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
    <div className="grid gap-1.5">
      <LabelAjuda titulo={titulo} ajuda={ajuda}>
        {titulo}
      </LabelAjuda>
      <div className="grid gap-2">
        {linhas.map((nome) => {
          const qtd = itens.find((i) => mesmoNome(i.nome, nome))?.qtd ?? 0;
          return (
            <div key={nome} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <span className={cn("text-sm", qtd > 0 && "font-medium")}>{nome}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label={`Diminuir ${nome}`}
                  onClick={() => ajustar(nome, -1)}
                  disabled={qtd === 0}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-6 text-center font-medium">{qtd}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label={`Aumentar ${nome}`}
                  onClick={() => ajustar(nome, 1)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
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
            className="h-11"
            maxLength={60}
          />
          <Button type="button" variant="secondary" className="h-11" onClick={adicionarOutro} disabled={!outro.trim()}>
            <Plus className="size-4" /> Incluir
          </Button>
        </div>
      </div>
    </div>
  );
}
