"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import type { MaterialCatalogo, VinculoMaterial } from "@/services/materiais";
import { Check, Plus } from "lucide-react";

// Decisão do usuário para um item lido da nota: ligar ao catálogo, cadastrar como novo ou deixar avulso.
export function EscolhaMaterial({
  vinculo,
  descricao,
  unidade,
  catalogo,
  onChange,
}: {
  vinculo: VinculoMaterial;
  descricao: string;
  unidade: string;
  catalogo: MaterialCatalogo[];
  onChange: (v: VinculoMaterial) => void;
}) {
  const ligar = (id: string) => id && onChange({ modo: "existente", id, automatico: false });
  const cadastrarNovo = () => onChange({ modo: "novo", nome: descricao.trim(), unidade: unidade.trim() || "UN" });
  const opcoes = catalogo.map((m) => ({
    value: m.id,
    label: m.nome,
    descricao: [m.unidade, m.categoria].filter(Boolean).join(" · "),
  }));
  const buscador = (
    <Combobox
      options={opcoes}
      value=""
      onChange={ligar}
      placeholder="Buscar no catálogo..."
      vazio="Nenhum material encontrado"
      className="min-w-48 flex-1"
    />
  );

  if (vinculo.modo === "existente") {
    const material = catalogo.find((m) => m.id === vinculo.id);
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Check className="size-3.5 text-estado-no-prazo-fg" />
        <span>
          Material: <b>{material?.nome ?? "—"}</b>
        </span>
        {vinculo.automatico && <Badge variant="secondary">ligado automaticamente</Badge>}
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange({ modo: "pendente", candidatos: [] })}>
          Trocar
        </Button>
      </div>
    );
  }

  if (vinculo.modo === "novo") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">novo material</Badge>
        <Input
          aria-label="Nome do novo material"
          className="h-8 min-w-48 flex-1"
          value={vinculo.nome}
          onChange={(e) => onChange({ ...vinculo, nome: e.target.value })}
        />
        <Input
          aria-label="Unidade do novo material"
          className="h-8 w-20"
          value={vinculo.unidade}
          onChange={(e) => onChange({ ...vinculo, unidade: e.target.value })}
        />
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange({ modo: "pendente", candidatos: [] })}>
          Trocar
        </Button>
      </div>
    );
  }

  if (vinculo.modo === "nenhum") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Sem material do catálogo.</span>
        {buscador}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={cadastrarNovo} disabled={!descricao.trim()}>
          <Plus className="size-3.5" /> Cadastrar como novo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-estado-atencao-borda bg-estado-atencao p-2 text-xs text-estado-atencao-fg">
      <p className="font-medium">
        Material não reconhecido no catálogo — escolha com qual material este item corresponde.
      </p>
      {vinculo.candidatos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {vinculo.candidatos.map((c) => (
            <Button key={c.id} type="button" size="sm" variant="outline" className="h-auto whitespace-normal py-1 text-left text-xs" onClick={() => ligar(c.id)}>
              Ligar a: {c.nome} · {Math.round(c.similaridade * 100)}%
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {buscador}
        <Button type="button" size="sm" className="h-8 text-xs" onClick={cadastrarNovo} disabled={!descricao.trim()}>
          <Plus className="size-3.5" /> Cadastrar como novo
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onChange({ modo: "nenhum" })}>
          Item avulso
        </Button>
      </div>
    </div>
  );
}
