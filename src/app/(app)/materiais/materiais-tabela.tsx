"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { SelectNativo } from "@/components/select-nativo";
import { LINK_DA_LINHA, ListaDeDados, type ColunaDados } from "@/components/lista-de-dados";
import { chaveMaterial } from "@/services/materiais";
import { formatarMoeda } from "@/lib/format";
import { ChevronRight } from "lucide-react";

export type LinhaMaterial = {
  id: string;
  nome: string;
  unidade: string;
  categoria: string | null;
  usos: number;
  apelidos: string[];
  ultimoPrecoCents: number | null;
};

const COLUNAS: ColunaDados<LinhaMaterial>[] = [
  {
    id: "material",
    titulo: "Material",
    papel: "titulo",
    classe: "tabela:font-medium",
    celula: (l) => (
      <Link href={`/materiais/${l.id}`} className={LINK_DA_LINHA}>
        {l.nome}
      </Link>
    ),
  },
  { id: "categoria", titulo: "Categoria", classe: "tabela:text-muted-foreground", celula: (l) => l.categoria },
  { id: "unidade", titulo: "Und", celula: (l) => l.unidade },
  {
    id: "preco",
    titulo: "Último preço",
    papel: "valor",
    numerica: true,
    celula: (l) => (l.ultimoPrecoCents === null ? "—" : formatarMoeda(l.ultimoPrecoCents)),
  },
  { id: "usos", titulo: "Usos", numerica: true, celula: (l) => l.usos },
  {
    id: "abrir",
    titulo: "Abrir",
    papel: "acao",
    semCartao: true,
    tituloOculto: true,
    classeCabecalho: "w-10",
    celula: (l) => (
      <Link href={`/materiais/${l.id}`} className="inline-flex" title="Abrir material" aria-label={`Abrir ${l.nome}`}>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    ),
  },
];

export function MateriaisTabela({ linhas }: { linhas: LinhaMaterial[] }) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");

  const categorias = useMemo(
    () => [...new Set(linhas.map((l) => l.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [linhas],
  );
  const indexadas = useMemo(
    () => linhas.map((l) => ({ l, texto: chaveMaterial([l.nome, ...l.apelidos].join(" ")) })),
    [linhas],
  );

  const termo = chaveMaterial(busca);
  const visiveis = indexadas
    .filter(({ l, texto }) => (!categoria || l.categoria === categoria) && (!termo || termo.split(" ").every((p) => texto.includes(p))))
    .map(({ l }) => l);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          aria-label="Buscar material"
          placeholder="Buscar por nome ou apelido..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <SelectNativo className="w-56" aria-label="Filtrar por categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </SelectNativo>
        <span className="self-center text-sm text-muted-foreground">
          {visiveis.length} de {linhas.length}
        </span>
      </div>

      <ListaDeDados
        legenda="Materiais"
        linhas={visiveis}
        chave={(l) => l.id}
        colunas={COLUNAS}
        vazio="Nenhum material encontrado."
      />
    </div>
  );
}
