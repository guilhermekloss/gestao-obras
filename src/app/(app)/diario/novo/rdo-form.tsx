"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enviarArquivo, estourouPrazo, MSG_ENVIO_DEMOROU } from "@/lib/envio";
import type { CondicaoTrabalho } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarraDeAcao } from "@/components/barra-de-acao";
import { CabecalhoSecao } from "@/components/cabecalho-secao";
import { Combobox } from "@/components/combobox";
import { SeletorOpcoes, type Opcao } from "@/components/seletor-opcoes";
import { cn } from "@/lib/utils";
import { atualizarRdo, criarRdo } from "../actions";
import { dataParaInput } from "@/lib/format";
import { CLIMAS, CONDICOES, resumoClima, rotuloClima, rotuloCondicao, type Clima } from "@/services/rdo";
import { ContadorLista, type ItemContado } from "./contador-lista";
import {
  assinaturaDoConteudo,
  chaveRascunho,
  horaSalvo,
  lerRascunho,
  quandoSalvo,
  serializarRascunho,
  type ConteudoRdo,
} from "./rascunho";
import {
  Camera,
  CircleCheck,
  Cloud,
  CloudRain,
  CloudRainWind,
  CloudSun,
  HardHat,
  History,
  NotebookPen,
  OctagonX,
  Sun,
  Truck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

const FUNCOES = ["Pedreiro", "Servente", "Eletricista", "Encanador", "Pintor", "Carpinteiro"];
const EQUIPAMENTOS = ["Betoneira", "Andaime", "Vibrador de concreto", "Martelete", "Serra circular"];

const OPCOES_CLIMA: Opcao<Clima>[] = CLIMAS.map((c) => ({
  valor: c,
  rotulo: rotuloClima(c) ?? c,
  icone: { SOL: Sun, NUBLADO: Cloud, CHUVA: CloudRain, CHUVA_FORTE: CloudRainWind }[c],
}));

const ICONE_CONDICAO: Record<CondicaoTrabalho, LucideIcon> = {
  PRATICAVEL: CircleCheck,
  PARCIAL: TriangleAlert,
  IMPRATICAVEL: OctagonX,
};

const ESTILO_CONDICAO: Record<CondicaoTrabalho, string> = {
  PRATICAVEL: "border-estado-no-prazo-borda bg-estado-no-prazo text-estado-no-prazo-fg",
  PARCIAL: "border-estado-atencao-borda bg-estado-atencao text-estado-atencao-fg",
  IMPRATICAVEL: "border-estado-vencido-borda bg-estado-vencido text-estado-vencido-fg",
};

const OPCOES_CONDICAO: Opcao<CondicaoTrabalho>[] = CONDICOES.map((c) => ({
  valor: c,
  rotulo: rotuloCondicao(c) ?? c,
  icone: ICONE_CONDICAO[c],
  estiloMarcada: ESTILO_CONDICAO[c],
}));

// folga para o teclado do celular não esconder o campo atrás da barra de salvar
const CAMPO = "scroll-mb-24";
const ROTULO = "text-base font-semibold";

type Secao = "clima" | "equipe" | "equipamentos" | "atividades" | "fotos";
const SECOES_ABERTAS: Secao[] = ["clima", "atividades"];

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

// armazenamento bloqueado (aba anônima, cota cheia) só tira a conveniência do rascunho
function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {}
}
function removerLocal(chave: string) {
  try {
    localStorage.removeItem(chave);
  } catch {}
}

function conteudoInicial(v: RdoValores | undefined, obraInicial: string | undefined): ConteudoRdo {
  return {
    obraId: v?.obraId ?? obraInicial ?? "",
    data: v?.data ?? dataParaInput(new Date()),
    climaManha: v?.climaManha ?? "",
    climaTarde: v?.climaTarde ?? "",
    condicao: v?.condicao ?? "",
    efetivo: v?.efetivo.map((e) => ({ nome: e.funcao, qtd: e.qtd })) ?? [],
    equipamentos: v?.equipamentos ?? [],
    atividades: v?.atividades ?? "",
    ocorrencias: v?.ocorrencias ?? "",
    fotos: v?.fotos.map((f) => ({ url: f.url })) ?? [],
  };
}

const soma = (itens: ItemContado[]) => itens.reduce((a, i) => a + i.qtd, 0);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

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
  const obraRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HTMLInputElement>(null);
  const atividadesRef = useRef<HTMLTextAreaElement>(null);
  const v = rdo?.valores;
  const chave = chaveRascunho(rdo?.id);

  const [inicial] = useState(() => conteudoInicial(v, obraInicial));
  const [obraId, setObraId] = useState(inicial.obraId);
  const [data, setData] = useState(inicial.data);
  const [climaManha, setClimaManha] = useState<Clima | "">(inicial.climaManha);
  const [climaTarde, setClimaTarde] = useState<Clima | "">(inicial.climaTarde);
  const [condicao, setCondicao] = useState<CondicaoTrabalho | "">(inicial.condicao);
  const [efetivo, setEfetivo] = useState<ItemContado[]>(inicial.efetivo);
  const [equipamentos, setEquipamentos] = useState<ItemContado[]>(inicial.equipamentos);
  const [atividades, setAtividades] = useState(inicial.atividades);
  const [ocorrencias, setOcorrencias] = useState(inicial.ocorrencias);
  const [fotos, setFotos] = useState<FotoLocal[]>(inicial.fotos.map((f) => ({ url: f.url, preview: f.url })));
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const [secoes, setSecoes] = useState<Secao[]>(SECOES_ABERTAS);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [restauradoQuando, setRestauradoQuando] = useState<string | null>(null);
  const [guardadoEm, setGuardadoEm] = useState<number | null>(null);
  const [concluido, setConcluido] = useState<{ id: string | null } | null>(null);
  // depois de salvar ou cancelar o rascunho não pode voltar a ser gravado
  const encerrado = useRef(false);

  const conteudo = useMemo<ConteudoRdo>(
    () => ({
      obraId,
      data,
      climaManha,
      climaTarde,
      condicao,
      efetivo,
      equipamentos,
      atividades,
      ocorrencias,
      fotos: fotos.map((f) => ({ url: f.url })),
    }),
    [obraId, data, climaManha, climaTarde, condicao, efetivo, equipamentos, atividades, ocorrencias, fotos],
  );
  const assinatura = assinaturaDoConteudo(conteudo, !rdo);
  const [assinaturaInicial] = useState(() => assinaturaDoConteudo(inicial, !rdo));

  function aplicar(c: ConteudoRdo) {
    setObraId(obras.some((o) => o.id === c.obraId) ? c.obraId : "");
    setData(c.data);
    setClimaManha(c.climaManha);
    setClimaTarde(c.climaTarde);
    setCondicao(c.condicao);
    setEfetivo(c.efetivo);
    setEquipamentos(c.equipamentos);
    setAtividades(c.atividades);
    setOcorrencias(c.ocorrencias);
    setFotos(c.fotos.map((f) => ({ url: f.url, preview: f.url })));
  }

  const obraDefinida = Boolean(v || obraInicial);
  // localStorage só existe no cliente: lê pós-mount, fora do render síncrono
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rascunho = lerRascunho(lerLocal(chave), Date.now());
      if (rascunho) {
        aplicar(rascunho);
        setRestauradoQuando(quandoSalvo(rascunho.salvoEm, Date.now()));
      } else if (!obraDefinida) {
        const ultima = lerLocal("rdo:ultimaObra");
        if (ultima && obras.some((o) => o.id === ultima)) setObraId(ultima);
        else if (obras.length === 1) setObraId(obras[0].id);
      }
      setPronto(true);
    });
    return () => cancelAnimationFrame(frame);
    // roda uma vez, na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // guarda o que foi digitado, com uma pausa para não gravar a cada tecla
  useEffect(() => {
    if (!pronto || encerrado.current) return;
    const espera = setTimeout(() => {
      if (assinatura === assinaturaInicial) {
        removerLocal(chave);
        setGuardadoEm(null);
        return;
      }
      const agora = Date.now();
      gravarLocal(chave, serializarRascunho(conteudo, agora));
      setGuardadoEm(agora);
    }, 500);
    return () => clearTimeout(espera);
  }, [pronto, assinatura, assinaturaInicial, conteudo, chave]);

  function descartarRascunho() {
    removerLocal(chave);
    aplicar(inicial);
    setRestauradoQuando(null);
    setGuardadoEm(null);
  }

  function cancelarEdicao() {
    encerrado.current = true;
    removerLocal(chave);
    router.push(`/diario/${rdo!.id}`);
  }

  async function adicionarFotos(files: FileList | null) {
    if (!files?.length) return;
    setEnviandoFoto(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await comprimirImagem(file);
        const res = await enviarArquivo(new File([blob], "foto.jpg", { type: "image/jpeg" }));
        if (!res.ok) throw new Error("Falha no upload");
        const { url } = await res.json();
        setFotos((prev) => [...prev, { url, preview: URL.createObjectURL(blob) }]);
      }
    } catch (e) {
      toast.error(estourouPrazo(e) ? MSG_ENVIO_DEMOROU : "Erro ao enviar foto — verifique a conexão e tente de novo");
    } finally {
      setEnviandoFoto(false);
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
  }

  const faltaObra = !obraId;
  const faltaData = !data;
  const faltaAtividades = !atividades.trim();

  function abrirSecao(s: Secao) {
    setSecoes((atuais) => (atuais.includes(s) ? atuais : [...atuais, s]));
  }

  function salvar() {
    setTentouSalvar(true);
    if (faltaObra) return obraRef.current?.querySelector("input")?.focus();
    if (faltaData) return dataRef.current?.focus();
    if (faltaAtividades) {
      abrirSecao("atividades");
      // espera o painel abrir antes de pôr o foco
      return void requestAnimationFrame(() => atividadesRef.current?.focus());
    }

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
      let id: string | null;
      if (rdo) {
        const res = await atualizarRdo(rdo.id, input);
        if (!res.ok) return void toast.error(res.erro ?? "Erro ao salvar — tente novamente");
        id = rdo.id;
      } else {
        const res = await criarRdo(input);
        if (!res.ok) return void toast.error(res.erro ?? "Erro ao salvar — tente novamente");
        id = res.id ?? null;
      }
      encerrado.current = true;
      removerLocal(chave);
      setConcluido({ id });
    });
  }

  if (concluido) {
    return (
      <Confirmacao
        edicao={Boolean(rdo)}
        rdoId={concluido.id}
        detalhe={`${obras.find((o) => o.id === obraId)?.nome ?? "Obra"} · ${data.split("-").reverse().join("/")}`}
      />
    );
  }

  const resumoDoClima = [
    resumoClima({ climaManha, climaTarde }),
    condicao ? rotuloCondicao(condicao) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const totalEfetivo = soma(efetivo);
  const totalEquipamentos = soma(equipamentos);

  const falta = faltaObra ? "Falta escolher a obra." : faltaAtividades ? "Falta descrever as atividades." : null;
  const status = enviandoFoto
    ? "Enviando foto..."
    : pendente
      ? "Salvando..."
      : falta
        ? falta
        : guardadoEm
          ? `Rascunho guardado às ${horaSalvo(guardadoEm)}.`
          : "Pronto para salvar.";

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24 md:pb-0">
      {restauradoQuando && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border-2 border-estado-andamento-borda bg-estado-andamento p-3 text-estado-andamento-fg"
        >
          <History aria-hidden className="size-6 shrink-0" />
          <p className="min-w-0 flex-1 leading-snug">
            Recuperamos o rascunho salvo {restauradoQuando}.
          </p>
          <Button type="button" variant="outline" className="h-12 shrink-0 px-4" onClick={descartarRascunho}>
            Descartar
          </Button>
        </div>
      )}

      <div className="grid gap-5 rounded-xl bg-card p-4 ring-1 ring-border">
        <div className="grid gap-2" ref={obraRef}>
          <Label className={ROTULO}>Obra</Label>
          <Combobox
            value={obraId}
            onChange={setObraId}
            placeholder="Buscar obra..."
            vazio="Nenhuma obra encontrada"
            erro={tentouSalvar && faltaObra}
            mensagemErro="Selecione a obra"
            inputClassName={cn("h-14", CAMPO)}
            options={obras.map((o) => ({ value: o.id, label: o.nome }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rdo-data" className={ROTULO}>
            Data
          </Label>
          <Input
            ref={dataRef}
            id="rdo-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            aria-invalid={tentouSalvar && faltaData}
            className={cn("h-14", CAMPO)}
          />
          {tentouSalvar && faltaData && (
            <p role="alert" className="text-sm text-destructive">
              Informe a data.
            </p>
          )}
        </div>
      </div>

      <Accordion multiple value={secoes} onValueChange={(valor) => setSecoes(valor as Secao[])}>
        <AccordionItem value="clima">
          <AccordionTrigger>
            <CabecalhoSecao
              icone={CloudSun}
              titulo="Clima e condição"
              resumo={resumoDoClima || "Toque para informar"}
              preenchida={Boolean(resumoDoClima)}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <p className="text-sm text-muted-foreground">
              Como estava o tempo em cada turno. Ajuda a justificar chuva e atrasos.
            </p>
            <div className="grid gap-2">
              <p className={ROTULO}>Manhã</p>
              <SeletorOpcoes rotulo="Clima da manhã" valor={climaManha} onChange={setClimaManha} opcoes={OPCOES_CLIMA} />
            </div>
            <div className="grid gap-2">
              <p className={ROTULO}>Tarde</p>
              <SeletorOpcoes rotulo="Clima da tarde" valor={climaTarde} onChange={setClimaTarde} opcoes={OPCOES_CLIMA} />
            </div>
            {v?.climaLegado && <p className="text-sm text-muted-foreground">Registro antigo: {v.climaLegado}</p>}
            <div className="grid gap-2 border-t pt-4">
              <p className={ROTULO}>Dava para trabalhar?</p>
              <p className="text-sm text-muted-foreground">
                Marque impraticável se a chuva ou a falta de material parou a obra. Isso justifica dia perdido no prazo.
              </p>
              <SeletorOpcoes
                rotulo="Condição de trabalho"
                valor={condicao}
                onChange={setCondicao}
                opcoes={OPCOES_CONDICAO}
                colunas={1}
              />
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="equipe">
          <AccordionTrigger>
            <CabecalhoSecao
              icone={HardHat}
              titulo="Equipe"
              resumo={totalEfetivo > 0 ? plural(totalEfetivo, "pessoa", "pessoas") : "Ninguém contado"}
              preenchida={totalEfetivo > 0}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <p className="text-sm text-muted-foreground">Conte quem trabalhou hoje, por função.</p>
            <ContadorLista
              sugestoes={FUNCOES}
              itens={efetivo}
              onChange={setEfetivo}
              placeholderOutro="Outra função"
            />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="equipamentos">
          <AccordionTrigger>
            <CabecalhoSecao
              icone={Truck}
              titulo="Equipamentos"
              resumo={
                totalEquipamentos > 0 ? plural(totalEquipamentos, "equipamento", "equipamentos") : "Nenhum equipamento"
              }
              preenchida={totalEquipamentos > 0}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <p className="text-sm text-muted-foreground">O que ficou em uso na obra hoje, próprio ou alugado.</p>
            <ContadorLista
              sugestoes={EQUIPAMENTOS}
              itens={equipamentos}
              onChange={setEquipamentos}
              placeholderOutro="Outro equipamento"
            />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="atividades">
          <AccordionTrigger>
            <CabecalhoSecao
              icone={NotebookPen}
              titulo="Atividades"
              resumo={
                faltaAtividades
                  ? tentouSalvar
                    ? "Falta descrever o dia"
                    : "Obrigatório"
                  : atividades.trim()
              }
              preenchida={!faltaAtividades}
              erro={tentouSalvar && faltaAtividades}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <div className="grid gap-2">
              <Label htmlFor="rdo-atividades" className={ROTULO}>
                Atividades executadas
              </Label>
              <Textarea
                ref={atividadesRef}
                id="rdo-atividades"
                value={atividades}
                onChange={(e) => setAtividades(e.target.value)}
                aria-invalid={tentouSalvar && faltaAtividades}
                aria-describedby="rdo-atividades-ajuda"
                placeholder="Concretagem da laje do 2º pavimento..."
                className={cn("min-h-40", CAMPO)}
              />
              <p
                id="rdo-atividades-ajuda"
                role={tentouSalvar && faltaAtividades ? "alert" : undefined}
                className={cn("text-sm", tentouSalvar && faltaAtividades ? "text-destructive" : "text-muted-foreground")}
              >
                {tentouSalvar && faltaAtividades
                  ? "Descreva as atividades do dia."
                  : "O que foi feito hoje. É o conteúdo principal do RDO."}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rdo-ocorrencias" className={ROTULO}>
                Ocorrências (opcional)
              </Label>
              <Textarea
                id="rdo-ocorrencias"
                value={ocorrencias}
                onChange={(e) => setOcorrencias(e.target.value)}
                placeholder="Atraso na entrega de material..."
                className={cn("min-h-28", CAMPO)}
              />
              <p className="text-sm text-muted-foreground">Atrasos, faltas, acidentes ou falta de material.</p>
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="fotos">
          <AccordionTrigger>
            <CabecalhoSecao
              icone={Camera}
              titulo="Fotos"
              resumo={fotos.length > 0 ? plural(fotos.length, "foto", "fotos") : "Nenhuma foto"}
              preenchida={fotos.length > 0}
            />
          </AccordionTrigger>
          <AccordionPanel keepMounted>
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => adicionarFotos(e.target.files)}
            />
            {fotos.length > 0 && (
              <ul className="grid grid-cols-3 gap-3">
                {fotos.map((f, i) => (
                  <li key={f.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.preview} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      aria-label={`Remover foto ${i + 1}`}
                      onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 grid size-11 place-items-center rounded-lg bg-card text-destructive ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <X aria-hidden className="size-5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-14 w-full text-base pointer-coarse:h-14"
              onClick={() => inputFotoRef.current?.click()}
              disabled={enviandoFoto}
            >
              <Camera aria-hidden className="size-5" />
              {enviandoFoto ? "Enviando foto..." : fotos.length > 0 ? "Tirar outra foto" : "Tirar foto"}
            </Button>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {rdo && (
        <Button
          type="button"
          variant="ghost"
          className="h-12 w-full text-base pointer-coarse:h-12"
          onClick={cancelarEdicao}
          disabled={pendente}
        >
          Cancelar edição
        </Button>
      )}

      <BarraDeAcao>
        <p
          role="status"
          aria-live="polite"
          className={cn("min-w-0 flex-1 text-sm leading-snug", falta && !pendente && !enviandoFoto ? "text-foreground" : "text-muted-foreground")}
        >
          {status}
        </p>
        <Button
          className="h-14 shrink-0 px-6 text-lg pointer-coarse:h-14"
          onClick={salvar}
          disabled={pendente || enviandoFoto}
        >
          {pendente ? "Salvando..." : rdo ? "Salvar alterações" : "Salvar RDO"}
        </Button>
      </BarraDeAcao>
    </div>
  );
}

function Confirmacao({
  edicao,
  rdoId,
  detalhe,
}: {
  edicao: boolean;
  rdoId: string | null;
  detalhe: string;
}) {
  const ref = useRef<HTMLElement>(null);
  // leva a tela e o foco para a confirmação, que pode estar acima de onde o dedo parou
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section
        ref={ref}
        role="status"
        tabIndex={-1}
        className="rounded-xl border-2 border-estado-no-prazo-borda bg-estado-no-prazo p-6 text-estado-no-prazo-fg outline-none"
      >
        <CircleCheck aria-hidden className="size-14" />
        <h2 className="mt-3 text-2xl">{edicao ? "Alterações salvas" : "RDO salvo"}</h2>
        <p className="mt-1 text-lg leading-snug">{detalhe}</p>
      </section>
      <div className="grid gap-3">
        {rdoId && (
          <Link href={`/diario/${rdoId}`} className={cn(buttonVariants({ size: "lg" }), "h-14 text-lg pointer-coarse:h-14")}>
            Ver RDO
          </Link>
        )}
        <Link
          href="/diario"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 text-lg pointer-coarse:h-14")}
        >
          Voltar ao diário
        </Link>
      </div>
    </div>
  );
}
