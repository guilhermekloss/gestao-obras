"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { SelectNativo } from "@/components/select-nativo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          placeholder="Buscar por nome ou apelido..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <SelectNativo className="w-56" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </SelectNativo>
        <span className="self-center text-sm text-muted-foreground">
          {visiveis.length} de {linhas.length}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-muted-foreground">Nenhum material encontrado.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead>Und</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Último preço</TableHead>
                <TableHead className="text-right">Usos</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{l.categoria ?? "—"}</TableCell>
                  <TableCell>{l.unidade}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right">
                    {l.ultimoPrecoCents === null ? "—" : formatarMoeda(l.ultimoPrecoCents)}
                  </TableCell>
                  <TableCell className="text-right">{l.usos}</TableCell>
                  <TableCell>
                    <Link href={`/materiais/${l.id}`} className="inline-flex" title="Abrir material">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
