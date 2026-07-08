"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectNativo } from "@/components/select-nativo";
import { cn } from "@/lib/utils";
import { criarRdo } from "../actions";
import { Camera, Minus, Plus, X } from "lucide-react";

const CLIMAS = ["☀️ Sol", "⛅ Nublado", "🌧️ Chuva", "🌧️☀️ Chuva parcial"];
const FUNCOES = ["Pedreiro", "Servente", "Eletricista", "Encanador", "Pintor", "Carpinteiro"];

type Efetivo = { funcao: string; qtd: number };
type FotoLocal = { url: string; preview: string };

/** Comprime a imagem no cliente (canvas) para poupar dados móveis no canteiro. */
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

export function RdoForm({ obras }: { obras: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const [obraId, setObraId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [clima, setClima] = useState("");
  const [efetivo, setEfetivo] = useState<Efetivo[]>([]);
  const [atividades, setAtividades] = useState("");
  const [ocorrencias, setOcorrencias] = useState("");
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  // lembra a última obra usada — 1 toque a menos no canteiro
  // (localStorage só existe no cliente, então roda pós-mount, fora do render síncrono)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ultima = localStorage.getItem("rdo:ultimaObra");
      if (ultima && obras.some((o) => o.id === ultima)) setObraId(ultima);
      else if (obras.length === 1) setObraId(obras[0].id);
    });
    return () => cancelAnimationFrame(frame);
  }, [obras]);

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

  function ajustarEfetivo(funcao: string, delta: number) {
    setEfetivo((prev) => {
      const atual = prev.find((e) => e.funcao === funcao);
      const qtd = (atual?.qtd ?? 0) + delta;
      if (qtd <= 0) return prev.filter((e) => e.funcao !== funcao);
      if (atual) return prev.map((e) => (e.funcao === funcao ? { ...e, qtd } : e));
      return [...prev, { funcao, qtd }];
    });
  }

  function salvar() {
    if (!obraId) return toast.error("Selecione a obra");
    if (!atividades.trim()) return toast.error("Descreva as atividades do dia");

    localStorage.setItem("rdo:ultimaObra", obraId);
    startTransition(async () => {
      const res = await criarRdo({
        obraId,
        data,
        clima: clima || undefined,
        efetivo,
        atividades,
        ocorrencias: ocorrencias || undefined,
        fotos: fotos.map((f) => ({ url: f.url })),
      });
      if (res.ok) {
        toast.success("RDO registrado");
        router.push("/diario");
        router.refresh();
      } else {
        toast.error(res.erro ?? "Erro ao salvar — tente novamente");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Obra</Label>
          <SelectNativo value={obraId} onChange={(e) => setObraId(e.target.value)} className="h-11">
            <option value="">Selecione...</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label>Data</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Clima</Label>
        <div className="flex flex-wrap gap-2">
          {CLIMAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClima(clima === c ? "" : c)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm",
                clima === c ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Efetivo</Label>
        <div className="grid gap-2">
          {FUNCOES.map((funcao) => {
            const qtd = efetivo.find((e) => e.funcao === funcao)?.qtd ?? 0;
            return (
              <div key={funcao} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                <span className={cn("text-sm", qtd > 0 && "font-medium")}>{funcao}</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => ajustarEfetivo(funcao, -1)} disabled={qtd === 0}>
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center font-medium">{qtd}</span>
                  <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => ajustarEfetivo(funcao, 1)}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Atividades executadas</Label>
        <Textarea
          rows={3}
          value={atividades}
          onChange={(e) => setAtividades(e.target.value)}
          placeholder="Concretagem da laje do 2º pavimento..."
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Ocorrências (opcional)</Label>
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
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.preview} alt="" className="size-20 rounded-md object-cover" />
              <button
                type="button"
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

      <Button className="h-12 w-full text-base" onClick={salvar} disabled={pendente || enviandoFoto}>
        {pendente ? "Salvando..." : "Salvar RDO"}
      </Button>
    </div>
  );
}
