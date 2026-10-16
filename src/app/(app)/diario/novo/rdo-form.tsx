"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CondicaoTrabalho } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { LabelAjuda } from "@/components/campo-ajuda";
import { SelectNativo } from "@/components/select-nativo";
import { cn } from "@/lib/utils";
import { atualizarRdo, criarRdo } from "../actions";
import { dataParaInput } from "@/lib/format";
import { CLIMAS, CONDICOES, rotuloClima, rotuloCondicao, type Clima } from "@/services/rdo";
import { ContadorLista, type ItemContado } from "./contador-lista";
import { Camera, X } from "lucide-react";

const FUNCOES = ["Pedreiro", "Servente", "Eletricista", "Encanador", "Pintor", "Carpinteiro"];
const EQUIPAMENTOS = ["Betoneira", "Andaime", "Vibrador de concreto", "Martelete", "Serra circular"];

const ESTILO_CONDICAO: Record<CondicaoTrabalho, string> = {
  PRATICAVEL: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  PARCIAL: "border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IMPRATICAVEL: "border-red-600 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
};

type FotoLocal = { url: string; preview: string };

export type RdoValores = {
  obraId: string;
  data: string;
  climaManha: Clima | "";
  climaTarde: Clima | "";
  // texto livre de RDOs antigos: só exibido, não é mais gravado
  climaLegado: string | null;
  condicao: CondicaoTrabalho | "";
  efetivo: { funcao: string; qtd: number }[];
  equipamentos: { nome: string; qtd: number }[];
  atividades: string;
  ocorrencias: string;
  fotos: { url: string }[];
};

async function comprimirImagem(file: File, maxLado = 1600, qualidade = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", qualidade),
  );
}

export function RdoForm({
  obras,
  obraInicial,
  rdo,
}: {
  obras: { id: string; nome: string }[];
  obraInicial?: string;
  rdo?: { id: string; valores: RdoValores };
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const v = rdo?.valores;

  const [obraId, setObraId] = useState(v?.obraId ?? obraInicial ?? "");
  const [data, setData] = useState(v?.data ?? dataParaInput(new Date()));
  const [climaManha, setClimaManha] = useState<Clima | "">(v?.climaManha ?? "");
  const [climaTarde, setClimaTarde] = useState<Clima | "">(v?.climaTarde ?? "");
  const [condicao, setCondicao] = useState<CondicaoTrabalho | "">(v?.condicao ?? "");
  const [efetivo, setEfetivo] = useState<ItemContado[]>(
    v?.efetivo.map((e) => ({ nome: e.funcao, qtd: e.qtd })) ?? [],
  );
  const [equipamentos, setEquipamentos] = useState<ItemContado[]>(v?.equipamentos ?? []);
  const [atividades, setAtividades] = useState(v?.atividades ?? "");
  const [ocorrencias, setOcorrencias] = useState(v?.ocorrencias ?? "");
  const [fotos, setFotos] = useState<FotoLocal[]>(
    v?.fotos.map((f) => ({ url: f.url, preview: f.url })) ?? [],
  );
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const obraDefinida = Boolean(v || obraInicial);
  // localStorage só existe no cliente: lê pós-mount, fora do render síncrono
  useEffect(() => {
    if (obraDefinida) return;
    const frame = requestAnimationFrame(() => {
      const ultima = localStorage.getItem("rdo:ultimaObra");
      if (ultima && obras.some((o) => o.id === ultima)) setObraId(ultima);
      else if (obras.length === 1) setObraId(obras[0].id);
    });
    return () => cancelAnimationFrame(frame);
  }, [obras, obraDefinida]);

  async function adicionarFotos(files: FileList | null) {
    if (!files?.length) return;
    setEnviandoFoto(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await comprimirImagem(file);
        const fd = new FormData();
        fd.append("file", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Falha no upload");
        const { url } = await res.json();
        setFotos((prev) => [...prev, { url, preview: URL.createObjectURL(blob) }]);
      }
    } catch {
      toast.error("Erro ao enviar foto — verifique a conexão e tente de novo");
    } finally {
      setEnviandoFoto(false);
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
  }

  function salvar() {
    if (!obraId) return toast.error("Selecione a obra");
    if (!data) return toast.error("Informe a data");
    if (!atividades.trim()) return toast.error("Descreva as atividades do dia");

    try {
      localStorage.setItem("rdo:ultimaObra", obraId);
    } catch {
      // armazenamento bloqueado (aba anônima etc.) — só perde a conveniência
    }
    const input = {
      obraId,
      data,
      climaManha: climaManha || undefined,
      climaTarde: climaTarde || undefined,
      condicao: condicao || undefined,
      efetivo: efetivo.map((e) => ({ funcao: e.nome, qtd: e.qtd })),
      equipamentos,
      atividades,
      ocorrencias: ocorrencias || undefined,
      fotos: fotos.map((f) => ({ url: f.url })),
    };
    startTransition(async () => {
      if (rdo) {
        const res = await atualizarRdo(rdo.id, input);
        if (!res.ok) return void toast.error(res.erro ?? "Erro ao salvar — tente novamente");
        toast.success("RDO atualizado");
        router.push(`/diario/${rdo.id}`);
      } else {
        const res = await criarRdo(input);
        if (!res.ok) return void toast.error(res.erro ?? "Erro ao salvar — tente novamente");
        toast.success("RDO registrado");
        router.push(res.id ? `/diario/${res.id}` : "/diario");
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Obra</Label>
          <Combobox
            value={obraId}
            onChange={setObraId}
            placeholder="Buscar obra..."
            vazio="Nenhuma obra encontrada"
            inputClassName="h-11"
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rdo-data">Data</Label>
          <Input id="rdo-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <LabelAjuda ajuda="Condição do tempo em cada turno. Importante para justificar a produtividade e eventuais paralisações por chuva.">
          Clima
        </LabelAjuda>
        <div className="grid grid-cols-2 gap-3">
          <SeletorClima id="rdo-clima-manha" rotulo="Manhã" valor={climaManha} onChange={setClimaManha} />
          <SeletorClima id="rdo-clima-tarde" rotulo="Tarde" valor={climaTarde} onChange={setClimaTarde} />
        </div>
        {v?.climaLegado && (
          <p className="text-xs text-muted-foreground">Registro antigo: {v.climaLegado}</p>
        )}
      </div>

      <div className="grid gap-1.5">
        <LabelAjuda ajuda="Se foi possível trabalhar no dia. Marque impraticável quando chuva, falta de material ou outro motivo parou a obra — é o que justifica dias perdidos no prazo.">
          Condição de trabalho
        </LabelAjuda>
        <div className="grid grid-cols-3 gap-2">
          {CONDICOES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={condicao === c}
              onClick={() => setCondicao(condicao === c ? "" : c)}
              className={cn(
                "rounded-md border px-2 py-2 text-sm leading-tight",
                condicao === c ? cn("font-medium", ESTILO_CONDICAO[c]) : "text-muted-foreground",
              )}
            >
              {c === "PARCIAL" ? "Parcial" : rotuloCondicao(c)}
            </button>
          ))}
        </div>
      </div>

      <ContadorLista
        titulo="Efetivo"
        ajuda="Quantidade de trabalhadores presentes na obra hoje, por função. Use os botões + e − para contar cada categoria, ou inclua outra função."
        sugestoes={FUNCOES}
        itens={efetivo}
        onChange={setEfetivo}
        placeholderOutro="Outra função (ex.: Armador)"
      />

      <ContadorLista
        titulo="Equipamentos"
        ajuda="Equipamentos em uso na obra hoje (próprios ou alugados). Use + e − ou inclua outro equipamento."
        sugestoes={EQUIPAMENTOS}
        itens={equipamentos}
        onChange={setEquipamentos}
        placeholderOutro="Outro equipamento (ex.: Retroescavadeira)"
      />

      <div className="grid gap-1.5">
        <LabelAjuda ajuda="Descreva o que foi feito na obra hoje. É o conteúdo principal do relatório diário (RDO).">
          Atividades executadas
        </LabelAjuda>
        <Textarea
          rows={3}
          value={atividades}
          onChange={(e) => setAtividades(e.target.value)}
          placeholder="Concretagem da laje do 2º pavimento..."
        />
      </div>

      <div className="grid gap-1.5">
        <LabelAjuda ajuda="Registre imprevistos do dia: atrasos, faltas, acidentes, falta de material ou chuva que parou o serviço.">
          Ocorrências (opcional)
        </LabelAjuda>
        <Textarea
          rows={2}
          value={ocorrencias}
          onChange={(e) => setOcorrencias(e.target.value)}
          placeholder="Atraso na entrega de material..."
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Fotos</Label>
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => adicionarFotos(e.target.files)}
        />
        <div className="flex flex-wrap gap-2">
          {fotos.map((f, i) => (
            <div key={f.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.preview} alt="" className="size-20 rounded-md object-cover" />
              <button
                type="button"
                aria-label="Remover foto"
                onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={enviandoFoto}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-muted-foreground"
          >
            <Camera className="size-6" />
            <span className="text-[10px]">{enviandoFoto ? "Enviando..." : "Foto"}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {rdo && (
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 text-base"
            onClick={() => router.push(`/diario/${rdo.id}`)}
            disabled={pendente}
          >
            Cancelar
          </Button>
        )}
        <Button className="h-12 flex-[2] text-base" onClick={salvar} disabled={pendente || enviandoFoto}>
          {pendente ? "Salvando..." : rdo ? "Salvar alterações" : "Salvar RDO"}
        </Button>
      </div>
    </div>
  );
}

function SeletorClima({
  id,
  rotulo,
  valor,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: Clima | "";
  onChange: (v: Clima | "") => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </label>
      <SelectNativo
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value as Clima | "")}
        className="h-11"
      >
        <option value="">—</option>
        {CLIMAS.map((c) => (
          <option key={c} value={c}>
            {rotuloClima(c)}
          </option>
        ))}
      </SelectNativo>
    </div>
  );
}
