import type { ReactNode } from "react";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatarCno, normalizarCno } from "@/services/cno";
import { formatarDocumento } from "@/services/nfe-xml";
import type { Nfse, PessoaNfse } from "@/services/nfse-xml";

// Campos e rótulos do DANFSe (NT 008 da NFS-e nacional), desenhados em HTML a partir do XML já lido:
// sem PDF, sem serviço no servidor. É a conferência visual, não a representação oficial.

const SIMPLES: Record<string, string> = { "1": "Não optante", "2": "Optante — MEI", "3": "Optante — ME/EPP" };
const APURACAO_SN: Record<string, string> = {
  "1": "Federais e municipal pelo SN",
  "2": "Federais pelo SN e ISSQN por fora",
  "3": "Federais e municipal por fora do SN",
};
const REGIME_ESPECIAL: Record<string, string> = {
  "0": "Nenhum",
  "1": "Ato cooperado (cooperativa)",
  "2": "Estimativa",
  "3": "Microempresa municipal",
  "4": "Notário ou registrador",
  "5": "Profissional autônomo",
  "6": "Sociedade de profissionais",
  "9": "Outros",
};
const TRIBUTACAO_ISSQN: Record<string, string> = {
  "1": "Operação tributável",
  "2": "Imunidade",
  "3": "Exportação de serviço",
  "4": "Não incidência",
};
const RETENCAO_ISSQN: Record<string, string> = {
  "1": "Não retido",
  "2": "Retido pelo tomador",
  "3": "Retido pelo intermediário",
};
const RETENCAO_PIS_COFINS: Record<string, string> = {
  "0": "PIS/COFINS/CSLL não retidos",
  "1": "PIS/COFINS retidos",
  "2": "PIS/COFINS não retidos",
  "3": "PIS/COFINS/CSLL retidos",
  "4": "PIS/COFINS retidos, CSLL não retido",
  "5": "PIS retido, COFINS/CSLL não retidos",
  "6": "COFINS retido, PIS/CSLL não retidos",
  "7": "PIS não retido, COFINS/CSLL retidos",
  "8": "PIS/COFINS não retidos, CSLL retido",
  "9": "COFINS não retido, PIS/CSLL retidos",
};
const SITUACAO: Record<string, string> = {
  "100": "NFS-e regular",
  "101": "NFS-e cancelada",
  "102": "NFS-e substituída",
  "103": "Decisão judicial ou administrativa",
  "104": "Emitida em contingência",
  "105": "NFS-e de ajuste",
};

const TRACO = "-";

function rotulo(mapa: Record<string, string>, codigo: string | null): string {
  if (!codigo) return TRACO;
  return mapa[codigo] ? `${codigo} — ${mapa[codigo]}` : codigo;
}

function moeda(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? TRACO : formatarMoeda(cents);
}

function pct(p: string | null | undefined): string {
  return p ? `${p.replace(".", ",")}%` : TRACO;
}

function data(d: string | null | undefined): string {
  return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : TRACO;
}

// hora local do emissor, como veio (sem converter fuso)
function dataHora(d: string | null | undefined): string {
  if (!d) return TRACO;
  const hora = /T(\d{2}:\d{2})/.exec(d)?.[1];
  return hora ? `${data(d)} ${hora}` : data(d);
}

function cep(c: string | null): string | null {
  return c && /^\d{8}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 5)}-${c.slice(5)}` : c;
}

// 010101 → 01.01.01 (item/subitem/desdobro da LC 116)
function codigoTributacao(c: string | null): string | null {
  return c && /^\d{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c;
}

// 101011100 → 1.0101.11.00 (NBS)
function codigoNbs(c: string | null): string | null {
  return c && /^\d{9}$/.test(c) ? `${c[0]}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7)}` : c;
}

function juntar(...partes: (string | null | undefined)[]): string {
  const presentes = partes.map((p) => p?.trim() || TRACO);
  return presentes.every((p) => p === TRACO) ? TRACO : presentes.join(" / ");
}

function Campo({ rotulo, children, largura }: { rotulo: string; children: ReactNode; largura?: "inteira" | "metade" }) {
  return (
    <div
      className={cn(
        "min-w-0 px-2 py-1.5",
        largura === "inteira" && "col-span-2 sm:col-span-4",
        largura === "metade" && "col-span-2",
      )}
    >
      <dt className="text-[0.7rem] leading-tight font-medium tracking-wide text-muted-foreground uppercase">{rotulo}</dt>
      <dd className="break-words">{children || TRACO}</dd>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t">
      <h3 className="bg-muted px-2 py-1 text-xs font-semibold tracking-wide uppercase">{titulo}</h3>
      <dl className="grid grid-cols-2 gap-x-2 sm:grid-cols-4">{children}</dl>
    </section>
  );
}

function Pessoa({ titulo, p, extra }: { titulo: string; p: PessoaNfse; extra?: ReactNode }) {
  return (
    <Secao titulo={titulo}>
      <Campo rotulo="CNPJ / CPF / NIF">{p.documento ? formatarDocumento(p.documento) : TRACO}</Campo>
      <Campo rotulo="Inscrição municipal">{p.inscricaoMunicipal}</Campo>
      <Campo rotulo="Nome / nome empresarial" largura="metade">
        {p.nome}
      </Campo>
      <Campo rotulo="Endereço" largura="metade">
        {p.endereco}
      </Campo>
      <Campo rotulo="Município (IBGE) / UF / CEP">{juntar(p.codigoMunicipio, p.uf, cep(p.cep))}</Campo>
      <Campo rotulo="Telefone / e-mail">{juntar(p.fone, p.email)}</Campo>
      {extra}
    </Secao>
  );
}

/** NFS-e nacional no estilo do DANFSe, a partir do XML lido (parseNfseXml). */
export function VisualizacaoNfse({ nfse, className }: { nfse: Nfse; className?: string }) {
  const { emitente, servico, issqn, valores, federais, ibsCbs } = nfse;
  const extra = nfse.ibsCbsNfse;
  const pisCofinsRetido = federais.tipoRetencaoPisCofins === "1";
  // NT 008: com PIS/COFINS retidos (tpRetPisCofins 1) eles somam às contribuições retidas e o débito próprio é zero
  const contribuicoesRetidas = pisCofinsRetido
    ? (federais.csllCents ?? 0) + (federais.pisCents ?? 0) + (federais.cofinsCents ?? 0)
    : federais.csllCents;
  const totalIbsCbs = ibsCbs ? (ibsCbs.cbsCents ?? 0) + (ibsCbs.ibsUfCents ?? 0) + (ibsCbs.ibsMunCents ?? 0) : null;
  const cnoDaObra = normalizarCno(servico.obra?.codigo);

  return (
    <article
      aria-label={`NFS-e ${nfse.numero} de ${emitente.razaoSocial}`}
      className={cn("overflow-hidden rounded-lg border bg-card text-sm text-card-foreground", className)}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-2">
        <div>
          <p className="font-semibold tracking-wide uppercase">Documento auxiliar da NFS-e</p>
          <p className="text-xs text-muted-foreground">
            Visualização a partir do XML · {servico.localPrestacao ?? emitente.uf ?? "NFS-e nacional"}
          </p>
        </div>
        {nfse.homologacao && (
          <span className="rounded border border-estado-atencao-borda bg-estado-atencao px-2 py-0.5 text-xs font-semibold text-estado-atencao-fg uppercase">
            Sem validade jurídica (homologação)
          </span>
        )}
      </header>
      <dl className="grid grid-cols-2 gap-x-2 border-t sm:grid-cols-4">
        <Campo rotulo="Número da NFS-e">
          <span className="text-base font-semibold num">{nfse.numero}</span>
        </Campo>
        <Campo rotulo="Competência">{data(nfse.dataCompetencia)}</Campo>
        <Campo rotulo="Emissão da NFS-e">{dataHora(nfse.emitidaEm ?? nfse.dataEmissao)}</Campo>
        <Campo rotulo="Situação">{rotulo(SITUACAO, nfse.situacao)}</Campo>
        <Campo rotulo="Número / série da DPS">{juntar(nfse.dps.numero, nfse.dps.serie)}</Campo>
        <Campo rotulo="Emissão da DPS">{dataHora(nfse.dps.emitidaEm)}</Campo>
        <Campo rotulo="Chave de acesso" largura="metade">
          <span className="font-mono text-xs break-all">{nfse.chave.replace(/(\d{5})(?=\d)/g, "$1 ")}</span>
        </Campo>
      </dl>

      <Pessoa
        titulo="Prestador / fornecedor"
        p={emitente}
        extra={
          <>
            <Campo rotulo="Simples Nacional na competência">{rotulo(SIMPLES, nfse.regime.opSimpNac)}</Campo>
            <Campo rotulo="Apuração pelo SN">{rotulo(APURACAO_SN, nfse.regime.regApTribSN)}</Campo>
          </>
        }
      />
      {nfse.tomador ? (
        <Pessoa titulo="Tomador / adquirente" p={nfse.tomador} />
      ) : (
        <p className="border-t px-2 py-1.5 text-xs text-muted-foreground uppercase">
          Tomador / adquirente não identificado na NFS-e
        </p>
      )}

      <Secao titulo="Serviço prestado">
        <Campo rotulo="Tributação nacional / municipal">
          {juntar(codigoTributacao(servico.codigoTributacaoNacional), servico.codigoTributacaoMunicipal)}
        </Campo>
        <Campo rotulo="Código da NBS">{codigoNbs(servico.nbs)}</Campo>
        <Campo rotulo="Local da prestação">{servico.localPrestacao}</Campo>
        <Campo rotulo="Descrição da tributação">{servico.descricaoTributacao}</Campo>
        <Campo rotulo="Descrição do serviço" largura="inteira">
          <span className="whitespace-pre-line">{servico.descricao}</span>
        </Campo>
        {servico.obra && (
          <Campo rotulo="Obra (CNO / CIB / inscrição imobiliária)" largura="inteira">
            {juntar(
              cnoDaObra ? formatarCno(cnoDaObra) : servico.obra.codigo,
              servico.obra.cib,
              servico.obra.inscricaoImobiliaria,
            )}
          </Campo>
        )}
      </Secao>

      <Secao titulo="Tributação municipal (ISSQN)">
        <Campo rotulo="Tributação do ISSQN">{rotulo(TRIBUTACAO_ISSQN, issqn.tributacao)}</Campo>
        <Campo rotulo="Município de incidência">{servico.municipioIncidencia}</Campo>
        <Campo rotulo="Regime especial">{rotulo(REGIME_ESPECIAL, nfse.regime.regEspTrib)}</Campo>
        <Campo rotulo="Retenção do ISSQN">
          <span className={cn(issqn.retido && "font-semibold")}>{rotulo(RETENCAO_ISSQN, issqn.tipoRetencao)}</span>
        </Campo>
        <Campo rotulo="Deduções / reduções">{moeda(issqn.deducoesCents)}</Campo>
        <Campo rotulo="Desconto incondicionado">{valores.descontoIncondicionadoCents ? moeda(valores.descontoIncondicionadoCents) : TRACO}</Campo>
        <Campo rotulo="BC do ISSQN / alíquota">{juntar(moeda(issqn.baseCents), pct(issqn.aliquota))}</Campo>
        <Campo rotulo="ISSQN apurado">{moeda(issqn.valorCents)}</Campo>
      </Secao>

      <Secao titulo="Tributação federal (exceto CBS)">
        <Campo rotulo="IRRF">{moeda(federais.irrfCents)}</Campo>
        <Campo rotulo="Contribuição previdenciária retida">{moeda(federais.cpCents)}</Campo>
        <Campo rotulo="Contribuições sociais retidas">{moeda(contribuicoesRetidas)}</Campo>
        <Campo rotulo="Retenção de PIS/COFINS/CSLL">{rotulo(RETENCAO_PIS_COFINS, federais.tipoRetencaoPisCofins)}</Campo>
        <Campo rotulo="PIS — débito próprio">{pisCofinsRetido ? moeda(0) : moeda(federais.pisCents)}</Campo>
        <Campo rotulo="COFINS — débito próprio">{pisCofinsRetido ? moeda(0) : moeda(federais.cofinsCents)}</Campo>
      </Secao>

      {(ibsCbs || extra) && (
        <Secao titulo="Tributação IBS / CBS">
          <Campo rotulo="CST / cClassTrib">{juntar(ibsCbs?.cst, ibsCbs?.cClassTrib)}</Campo>
          <Campo rotulo="Indicador da operação / localidade" largura="metade">
            {juntar(extra?.indicadorOperacao, extra?.codigoLocalidade, extra?.localidade)}
          </Campo>
          <Campo rotulo="Base de cálculo">{moeda(ibsCbs?.ibsCbsBaseCents)}</Campo>
          <Campo rotulo="Alíquota IBS UF / IBS mun.">{juntar(pct(ibsCbs?.pIbsUf), pct(ibsCbs?.pIbsMun))}</Campo>
          <Campo rotulo="Alíq. efetiva IBS UF / mun.">{juntar(pct(extra?.pAliqEfetUf), pct(extra?.pAliqEfetMun))}</Campo>
          <Campo rotulo="Red. alíquota IBS / CBS">{juntar(pct(ibsCbs?.pRedIbs), pct(ibsCbs?.pRedCbs))}</Campo>
          <Campo rotulo="Alíquota CBS / efetiva">{juntar(pct(ibsCbs?.pCbs), pct(extra?.pAliqEfetCbs))}</Campo>
          <Campo rotulo="IBS estadual / municipal">{juntar(moeda(ibsCbs?.ibsUfCents), moeda(ibsCbs?.ibsMunCents))}</Campo>
          <Campo rotulo="CBS">{moeda(ibsCbs?.cbsCents)}</Campo>
          {ibsCbs?.ibsCbsDiferidoCents ? <Campo rotulo="Diferido">{moeda(ibsCbs.ibsCbsDiferidoCents)}</Campo> : null}
          {ibsCbs?.credPresCents ? <Campo rotulo="Crédito presumido">{moeda(ibsCbs.credPresCents)}</Campo> : null}
        </Secao>
      )}

      <Secao titulo="Valor total da NFS-e">
        <Campo rotulo="Valor do serviço">{moeda(valores.servicoCents)}</Campo>
        <Campo rotulo="Desconto condicionado">{valores.descontoCondicionadoCents ? moeda(valores.descontoCondicionadoCents) : TRACO}</Campo>
        <Campo rotulo="Total das retenções (ISSQN / federais)">
          {moeda(valores.totalRetencoesXmlCents ?? (nfse.retencoes.totalCents || null))}
        </Campo>
        <Campo rotulo="Valor líquido da NFS-e">
          <span className="text-base font-semibold num">{moeda(valores.liquidoCents)}</span>
        </Campo>
        {extra && (
          <>
            <Campo rotulo="Total do IBS/CBS">{totalIbsCbs ? moeda(totalIbsCbs) : TRACO}</Campo>
            <Campo rotulo="Valor líquido + IBS/CBS">{moeda(extra.vTotNfCents)}</Campo>
          </>
        )}
      </Secao>

      {servico.informacoesComplementares && (
        <Secao titulo="Informações complementares">
          <Campo rotulo="Texto do emitente" largura="inteira">
            <span className="whitespace-pre-line">{servico.informacoesComplementares}</span>
          </Campo>
        </Secao>
      )}
    </article>
  );
}
