"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { KeyRound, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampoForm } from "@/components/campo-form";
import { SelectNativo } from "@/components/select-nativo";
import { configurarCaptura, enviarCertificado, salvarEmpresa, type EstadoForm } from "./actions";

function useAvisoDoEstado(estado: EstadoForm, aoDarCerto?: () => void) {
  const anterior = useRef(estado);
  useEffect(() => {
    if (estado === anterior.current) return;
    anterior.current = estado;
    if (estado.ok && estado.mensagem) {
      toast.success(estado.mensagem);
      aoDarCerto?.();
    }
  }, [estado, aoDarCerto]);
}

function Erro({ estado }: { estado: EstadoForm }) {
  if (estado.ok || !estado.erro) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {estado.erro}
    </p>
  );
}

export type EmpresaForm = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  filiais: string;
  uf: string;
};

export function DadosEmpresaForm({ inicial, ufs }: { inicial: EmpresaForm; ufs: string[] }) {
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(salvarEmpresa, { ok: true });
  useAvisoDoEstado(estado);
  return (
    <form action={enviar} className="grid gap-4 md:grid-cols-2">
      <CampoForm id="razaoSocial" rotulo="Razão social" className="md:col-span-2">
        <Input id="razaoSocial" name="razaoSocial" required maxLength={200} defaultValue={inicial.razaoSocial} autoComplete="organization" />
      </CampoForm>
      <CampoForm id="nomeFantasia" rotulo="Nome fantasia (opcional)">
        <Input id="nomeFantasia" name="nomeFantasia" maxLength={200} defaultValue={inicial.nomeFantasia} />
      </CampoForm>
      <CampoForm id="uf" rotulo="UF">
        <SelectNativo id="uf" name="uf" defaultValue={inicial.uf}>
          {ufs.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectNativo>
      </CampoForm>
      <CampoForm id="cnpj" rotulo="CNPJ da matriz">
        <Input id="cnpj" name="cnpj" required inputMode="numeric" placeholder="00.000.000/0000-00" defaultValue={inicial.cnpj} />
      </CampoForm>
      <CampoForm id="filiais" rotulo="CNPJs das filiais (opcional)" dica="Um por linha. Notas emitidas para as filiais também são capturadas.">
        <Textarea id="filiais" name="filiais" rows={3} defaultValue={inicial.filiais} />
      </CampoForm>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Erro estado={estado} />
        <Button type="submit" disabled={pendente} className="w-fit">
          <Save className="size-4" /> {pendente ? "Salvando..." : "Salvar dados"}
        </Button>
      </div>
    </form>
  );
}

export function CertificadoForm({ substituir, desabilitado }: { substituir: boolean; desabilitado: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(enviarCertificado, { ok: true });
  useAvisoDoEstado(estado, () => formRef.current?.reset());
  return (
    <form ref={formRef} action={enviar} className="grid gap-4 md:grid-cols-2">
      <CampoForm id="arquivo" rotulo="Arquivo do certificado (.pfx ou .p12)">
        <Input id="arquivo" name="arquivo" type="file" accept=".pfx,.p12,application/x-pkcs12" required disabled={desabilitado} />
      </CampoForm>
      <CampoForm id="senha" rotulo="Senha do certificado" dica="Usada só para abrir o arquivo agora; não fica guardada.">
        <Input id="senha" name="senha" type="password" required autoComplete="off" maxLength={256} disabled={desabilitado} />
      </CampoForm>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Erro estado={estado} />
        <Button type="submit" disabled={pendente || desabilitado} className="w-fit">
          {substituir ? <KeyRound className="size-4" /> : <Upload className="size-4" />}
          {pendente ? "Conferindo o certificado..." : substituir ? "Substituir certificado" : "Enviar certificado"}
        </Button>
      </div>
    </form>
  );
}

export function CapturaForm({
  ativa,
  ambiente,
  frequencia,
  podeLigar,
}: {
  ativa: boolean;
  ambiente: "HOMOLOGACAO" | "PRODUCAO";
  frequencia: "UMA_VEZ_DIA" | "DUAS_VEZES_DIA";
  podeLigar: boolean;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(configurarCaptura, { ok: true });
  useAvisoDoEstado(estado);
  return (
    <form action={enviar} className="grid gap-4">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="ativa" defaultChecked={ativa} disabled={!podeLigar && !ativa} className="size-5 accent-primary" />
        <span>
          <span className="font-medium">Buscar automaticamente as NF-e emitidas contra a empresa</span>
          <span className="block text-muted-foreground">
            Consulta a Sefaz sozinha, nos horários abaixo (Brasília). Nada se perde entre uma consulta e outra: a Sefaz
            guarda 90 dias de notas.
          </span>
        </span>
      </label>
      <CampoForm
        id="frequencia"
        rotulo="Quantas vezes por dia"
        dica="Uma por dia basta para a maioria das empresas. Mais consultas só gastam recursos e aumentam o risco de bloqueio pela Sefaz, que exige pelo menos 1 hora entre elas."
      >
        <SelectNativo id="frequencia" name="frequencia" defaultValue={frequencia} className="max-w-xs">
          <option value="UMA_VEZ_DIA">Uma vez ao dia (07:00)</option>
          <option value="DUAS_VEZES_DIA">Duas vezes ao dia (07:00 e 14:00)</option>
        </SelectNativo>
      </CampoForm>
      <CampoForm id="ambiente" rotulo="Ambiente da Sefaz" dica="Comece em homologação (testes, sem valor fiscal). Depois de conferir, mude para produção.">
        <SelectNativo id="ambiente" name="ambiente" defaultValue={ambiente} className="max-w-xs">
          <option value="HOMOLOGACAO">Homologação (testes)</option>
          <option value="PRODUCAO">Produção</option>
        </SelectNativo>
      </CampoForm>
      <p className="rounded-xl border border-estado-atencao-borda bg-estado-atencao p-3 text-sm text-estado-atencao-fg">
        <strong>Antes de ligar:</strong> se o contador ou outro sistema (ERP, Qive, Arquivei) já baixa as NF-e deste CNPJ
        na Sefaz, avise. Dois sistemas consultando o mesmo CNPJ podem se atrapalhar e causar bloqueio de 1 hora.
      </p>
      <Erro estado={estado} />
      <Button type="submit" variant="outline" disabled={pendente} className="w-fit">
        <Save className="size-4" /> {pendente ? "Salvando..." : "Salvar captura"}
      </Button>
    </form>
  );
}
