// Gera o SQL da carga da classificação tributária do IBS/CBS a partir do repositório da calculadora da Receita.
//
// Uso:
//   git clone https://github.com/ReceitaFederal/calculadora-rtc-regime-regular /caminho/rtc
//   npx tsx scripts/tributacao/gerar-carga-classificacao.ts /caminho/rtc --saida prisma/migrations/<timestamp>_carga_classificacao_tributaria/migration.sql
//   (sem --saida, o SQL sai na saída padrão)
//
// A base da Receita é SQLite montada pelo Flyway: B0001 (criação) + V0002..Vnnnn (manutenção), em ordem de versão.
// O script refaz essa montagem em memória (node:sqlite) e lê o estado final, então nunca lê o .db pronto.
// O SQL apaga e recarrega as duas tabelas: a cada release da Receita, rode de novo e grave numa migration NOVA
// (nunca edite a migration que já foi para a main). A saída é determinística: sem mudança na Receita, sem diferença.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type Linha = Record<string, string | number | null>;

function argumentos(): { repo: string; saida: string | null } {
  const args = process.argv.slice(2);
  const i = args.indexOf("--saida");
  const saida = i >= 0 ? (args[i + 1] ?? null) : null;
  const repo = args.find((a, j) => !a.startsWith("--") && (i < 0 || j !== i + 1));
  if (!repo) {
    console.error("Uso: npx tsx scripts/tributacao/gerar-carga-classificacao.ts <repo calculadora-rtc> [--saida <arquivo.sql>]");
    process.exit(1);
  }
  return { repo: path.resolve(repo), saida };
}

// Mesma ordem e transações do Flyway: o defer_foreign_keys de alguns scripts só vale dentro de transação.
function montarBase(repo: string): DatabaseSync {
  const dir = path.join(repo, "flyway", "sql");
  const db = new DatabaseSync(":memory:");
  const ler = (...p: string[]) => readFileSync(path.join(dir, ...p), "utf8");
  db.exec(ler("criacao", "beforeMigrate.sql"));
  db.exec(ler("criacao", "B0001__sistema_tributario_completo.sql"));
  const versao = (f: string) => Number(/^V(\d+)__/.exec(f)?.[1]);
  const scripts = readdirSync(path.join(dir, "manutencao"))
    .filter((f) => /^V\d+__.+\.sql$/.test(f))
    .sort((a, b) => versao(a) - versao(b));
  for (const f of scripts) {
    const sql = ler("manutencao", f);
    try {
      // PRAGMA foreign_keys não tem efeito dentro de transação: esses scripts rodam soltos, como no Flyway
      if (/PRAGMA\s+foreign_keys/i.test(sql)) db.exec(sql);
      else {
        db.exec("BEGIN");
        db.exec(sql);
        db.exec("COMMIT");
      }
    } catch (e) {
      throw new Error(`Falha ao aplicar ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  db.exec(ler("criacao", "afterMigrate.sql"));
  const violacoes = db.prepare("PRAGMA foreign_key_check").all();
  if (violacoes.length > 0) throw new Error(`A base da Receita ficou com ${violacoes.length} violação(ões) de chave estrangeira.`);
  return db;
}

function origem(repo: string, db: DatabaseSync) {
  const pom = readFileSync(path.join(repo, "pom.xml"), "utf8");
  // a versão do projeto é a primeira <version> depois do bloco <parent>
  const release = /<\/parent>[\s\S]*?<version>([^<]+)<\/version>/.exec(pom)?.[1] ?? "desconhecida";
  let commit = "desconhecido";
  try {
    commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // sem git (cópia baixada como .zip): o cabeçalho fica sem o commit
  }
  const base = db
    .prepare("SELECT VRBD_VERSAO_BASE_DADO v, VRBD_DATA d FROM VERSAO_BASE_DADO ORDER BY VRBD_ID DESC LIMIT 1")
    .get() as Linha;
  return { release, commit, versaoBase: String(base.v), dataBase: String(base.d).slice(0, 10) };
}

const data = (v: unknown, campo: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Data inválida em ${campo}: ${v}`);
  return d;
};

// 0/1 do SQLite; nulo (indicador não preenchido) vira false: na dúvida, sem crédito
const bool = (v: unknown, campo: string, codigo: string, avisos: string[]): boolean => {
  if (v === null || v === undefined) {
    avisos.push(`${codigo}: ${campo} vazio na base da Receita; gravado como false.`);
    return false;
  }
  return Number(v) === 1;
};

const textoLimpo = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t || null;
};

type Classificacao = {
  codigo: string;
  inicioVigencia: string;
  fimVigencia: string | null;
  cst: string;
  descricaoCst: string;
  descricao: string;
  tipoAliquota: string;
  nomenclatura: string | null;
  pRedCbs: number | null;
  pRedIbs: number | null;
  apropriaCreditoCbs: boolean;
  apropriaCreditoIbs: boolean;
  creditoPresumidoAdquirente: boolean;
  creditoPresumidoFornecedor: boolean;
  indEstornoCredito: boolean;
  indCreditoPresumidoOperacao: boolean;
  creditoOperacaoAntecedente: string | null;
  indReducao: boolean;
  indDiferimento: boolean;
};

type Nomenclatura = {
  tipo: "NCM" | "NBS";
  codigo: string;
  cClassTrib: string;
  excecao: boolean;
  itemLc116: string | null;
  cIndOp: string | null;
  inicioVigencia: string;
  fimVigencia: string | null;
};

function idsTributos(db: DatabaseSync) {
  const linhas = db.prepare("SELECT TBTO_ID id, TBTO_SIGLA sigla FROM TRIBUTO").all() as Linha[];
  const id = (sigla: string) => {
    const t = linhas.find((l) => l.sigla === sigla);
    if (!t) throw new Error(`Tributo ${sigla} não encontrado na base da Receita.`);
    return Number(t.id);
  };
  return { cbs: id("CBS"), ibsUf: id("IBSUF"), ibsMun: id("IBSMun") };
}

function lerClassificacoes(db: DatabaseSync, avisos: string[]): { lista: Classificacao[]; ids: number[] } {
  const t = idsTributos(db);
  // só as classificações de IBS/CBS: as do Imposto Seletivo reusam códigos e têm outra semântica
  const linhas = db
    .prepare(
      `SELECT c.CLTR_ID id, c.CLTR_CD codigo, c.CLTR_INICIO_VIGENCIA ini, c.CLTR_FIM_VIGENCIA fim,
              s.SITR_CD cst, s.SITR_DESCRICAO descricaoCst, c.CLTR_DESCRICAO descricao,
              c.CLTR_TIPO_ALIQUOTA tipoAliquota, c.CLTR_NOMENCLATURA nomenclatura,
              c.CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_CBS aprCbs, c.CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_IBS aprIbs,
              c.CLTR_IN_CREDITO_PRESUMIDO_ADQUIRENTE presAdq, c.CLTR_IN_CREDITO_PRESUMIDO_FORNECEDOR presForn,
              c.CLTR_IND_GESTORNOCRED estorno, c.CLTR_IND_GCREDPRESOPER presOper,
              c.CLTR_CREDITO_OPERACAO_ANTECEDENTE antecedente, s.SITR_IND_GRED red, s.SITR_IND_GDIF dif
         FROM CLASSIFICACAO_TRIBUTARIA c JOIN SITUACAO_TRIBUTARIA s ON s.SITR_ID = c.CLTR_SITR_ID
        WHERE EXISTS (SELECT 1 FROM TRIBUTO_SITUACAO_TRIBUTARIA x
                       WHERE x.TRST_SITR_ID = s.SITR_ID AND x.TRST_TBTO_ID IN (?, ?, ?))
        ORDER BY c.CLTR_CD, c.CLTR_INICIO_VIGENCIA`,
    )
    .all(t.cbs, t.ibsUf, t.ibsMun) as Linha[];

  const reducoes = db.prepare(
    `SELECT PERE_TBTO_ID tributo, PERE_VALOR valor FROM PERCENTUAL_REDUCAO
      WHERE PERE_CLTR_ID = ? ORDER BY PERE_INICIO_VIGENCIA DESC`,
  );
  const lista = linhas.map((l): Classificacao => {
    const codigo = String(l.codigo);
    const red = reducoes.all(l.id) as Linha[];
    // a mais recente de cada tributo (hoje há uma só por classificação)
    const de = (tributo: number) => {
      const r = red.find((x) => Number(x.tributo) === tributo);
      return r ? Number(r.valor) : null;
    };
    const [redUf, redMun] = [de(t.ibsUf), de(t.ibsMun)];
    if (redUf !== redMun) throw new Error(`${codigo}: redução do IBS da UF (${redUf}) difere da do município (${redMun}).`);
    const inicioVigencia = data(l.ini, `${codigo} início`);
    if (!inicioVigencia) throw new Error(`${codigo}: sem início de vigência.`);
    return {
      codigo,
      inicioVigencia,
      fimVigencia: data(l.fim, `${codigo} fim`),
      cst: String(l.cst),
      descricaoCst: textoLimpo(l.descricaoCst) ?? "",
      descricao: textoLimpo(l.descricao) ?? "",
      tipoAliquota: textoLimpo(l.tipoAliquota) ?? "",
      nomenclatura: textoLimpo(l.nomenclatura),
      pRedCbs: de(t.cbs),
      pRedIbs: redUf,
      apropriaCreditoCbs: bool(l.aprCbs, "apropriação de crédito da CBS", codigo, avisos),
      apropriaCreditoIbs: bool(l.aprIbs, "apropriação de crédito do IBS", codigo, avisos),
      // nulo nos indicadores de crédito presumido = a classificação não trata disso
      creditoPresumidoAdquirente: Number(l.presAdq) === 1,
      creditoPresumidoFornecedor: Number(l.presForn) === 1,
      indEstornoCredito: Number(l.estorno) === 1,
      indCreditoPresumidoOperacao: Number(l.presOper) === 1,
      creditoOperacaoAntecedente: textoLimpo(l.antecedente),
      indReducao: Number(l.red) === 1,
      indDiferimento: Number(l.dif) === 1,
    };
  });
  return { lista, ids: linhas.map((l) => Number(l.id)) };
}

function lerNomenclaturas(db: DatabaseSync, idsClassificacao: number[]): Nomenclatura[] {
  const ids = idsClassificacao.join(",");
  const consultar = (sql: string) => db.prepare(sql).all() as Linha[];
  const linhas: Nomenclatura[] = [];
  const somar = (tipo: Nomenclatura["tipo"], excecao: boolean, rs: Linha[]) => {
    for (const r of rs) {
      const inicioVigencia = data(r.ini, `${tipo} ${r.codigo}`);
      if (!inicioVigencia) throw new Error(`${tipo} ${r.codigo}: sem início de vigência.`);
      linhas.push({
        tipo,
        codigo: String(r.codigo).replace(/\D/g, ""),
        cClassTrib: String(r.cClassTrib),
        excecao,
        itemLc116: textoLimpo(r.item ?? null),
        cIndOp: textoLimpo(r.indOp ?? null),
        inicioVigencia,
        fimVigencia: data(r.fim, `${tipo} ${r.codigo}`),
      });
    }
  };
  somar("NCM", false, consultar(
    `SELECT n.NCMA_NCM_CD codigo, c.CLTR_CD cClassTrib, n.NCMA_INICIO_VIGENCIA ini, n.NCMA_FIM_VIGENCIA fim
       FROM NCM_APLICAVEL n JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = n.NCMA_CLTR_ID WHERE c.CLTR_ID IN (${ids})`,
  ));
  somar("NCM", true, consultar(
    `SELECT e.ENCM_NCM_CD codigo, c.CLTR_CD cClassTrib, e.ENCM_INICIO_VIGENCIA ini, e.ENCM_FIM_VIGENCIA fim
       FROM EXCECAO_NCM_APLICAVEL e JOIN NCM_APLICAVEL n ON n.NCMA_ID = e.ENCM_NCMA_ID
       JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = n.NCMA_CLTR_ID WHERE c.CLTR_ID IN (${ids})`,
  ));
  somar("NBS", false, consultar(
    `SELECT n.NBSA_NBS_CD codigo, c.CLTR_CD cClassTrib, n.NBSA_INICIO_VIGENCIA ini, n.NBSA_FIM_VIGENCIA fim
       FROM NBS_APLICAVEL n JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = n.NBSA_CLTR_ID WHERE c.CLTR_ID IN (${ids})`,
  ));
  somar("NBS", true, consultar(
    `SELECT e.ENBS_NBS_CD codigo, c.CLTR_CD cClassTrib, e.ENBS_INICIO_VIGENCIA ini, e.ENBS_FIM_VIGENCIA fim
       FROM EXCECAO_NBS_APLICAVEL e JOIN NBS_APLICAVEL n ON n.NBSA_ID = e.ENBS_NBSA_ID
       JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = n.NBSA_CLTR_ID WHERE c.CLTR_ID IN (${ids})`,
  ));
  // NFS-e: NBS × item da LC 116 × indicador de operação (Anexo VIII), com o histórico de vigências
  somar("NBS", false, consultar(
    `SELECT x.CNIL_NBS_CD codigo, c.CLTR_CD cClassTrib, x.CNIL_LSLC_CD item, i.IOIC_CD indOp,
            x.CNIL_INICIO_VIGENCIA ini, x.CNIL_FIM_VIGENCIA fim
       FROM CLASSIF_NBS_INDOP_LC x JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = x.CNIL_CLTR_ID
       JOIN INDICADOR_OPERACAO_IBS_CBS i ON i.IOIC_ID = x.CNIL_IOIC_ID WHERE c.CLTR_ID IN (${ids})`,
  ));

  // a base repete algumas linhas (mesma regra em ids diferentes): uma basta
  const unicas = new Map<string, Nomenclatura>();
  for (const l of linhas) unicas.set(JSON.stringify(l), l);
  const chave = (l: Nomenclatura) =>
    [l.tipo, l.codigo, l.cClassTrib, l.excecao ? 1 : 0, l.itemLc116 ?? "", l.cIndOp ?? "", l.inicioVigencia].join("|");
  return [...unicas.values()].sort((a, b) => (chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0));
}

const sqlTexto = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const sqlData = (v: string | null) => (v === null ? "NULL" : `DATE '${v}'`);
const sqlNumero = (v: number | null) => (v === null ? "NULL" : String(v));
const sqlBool = (v: boolean) => (v ? "true" : "false");

function inserts(tabela: string, colunas: string[], valores: string[][], porLote = 200): string {
  const blocos: string[] = [];
  for (let i = 0; i < valores.length; i += porLote) {
    const lote = valores.slice(i, i + porLote).map((v) => `  (${v.join(", ")})`);
    blocos.push(`INSERT INTO "${tabela}" (${colunas.map((c) => `"${c}"`).join(", ")}) VALUES\n${lote.join(",\n")};`);
  }
  return blocos.join("\n\n");
}

const LICENCA = `MIT License

Copyright (c) 2026 Receita Federal do Brasil

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function gerarSql(repo: string): { sql: string; avisos: string[] } {
  const db = montarBase(repo);
  const avisos: string[] = [];
  const o = origem(repo, db);
  const { lista, ids } = lerClassificacoes(db, avisos);
  const nomenclaturas = lerNomenclaturas(db, ids);
  db.close();

  const cabecalho = [
    "Carga da classificação tributária do IBS/CBS (cClassTrib) e da compatibilidade NCM/NBS × cClassTrib.",
    "Fonte: github.com/ReceitaFederal/calculadora-rtc-regime-regular (licença MIT, abaixo),",
    `  release ${o.release} (commit ${o.commit}), base de dados ${o.versaoBase} de ${o.dataBase}.`,
    "Gerado por scripts/tributacao/gerar-carga-classificacao.ts: não edite à mão; nova release = nova migration.",
    `${lista.length} classificações e ${nomenclaturas.length} linhas de NCM/NBS.`,
    "",
    ...LICENCA.split("\n"),
  ]
    .map((l) => (l ? `-- ${l}` : "--"))
    .join("\n");

  const classificacoes = inserts(
    "ClassificacaoTributaria",
    [
      "codigo", "inicioVigencia", "fimVigencia", "cst", "descricaoCst", "descricao", "tipoAliquota", "nomenclatura",
      "pRedCbs", "pRedIbs", "apropriaCreditoCbs", "apropriaCreditoIbs", "creditoPresumidoAdquirente",
      "creditoPresumidoFornecedor", "indEstornoCredito", "indCreditoPresumidoOperacao", "creditoOperacaoAntecedente",
      "indReducao", "indDiferimento",
    ],
    lista.map((c) => [
      sqlTexto(c.codigo), sqlData(c.inicioVigencia), sqlData(c.fimVigencia), sqlTexto(c.cst), sqlTexto(c.descricaoCst),
      sqlTexto(c.descricao), sqlTexto(c.tipoAliquota), sqlTexto(c.nomenclatura), sqlNumero(c.pRedCbs),
      sqlNumero(c.pRedIbs), sqlBool(c.apropriaCreditoCbs), sqlBool(c.apropriaCreditoIbs),
      sqlBool(c.creditoPresumidoAdquirente), sqlBool(c.creditoPresumidoFornecedor), sqlBool(c.indEstornoCredito),
      sqlBool(c.indCreditoPresumidoOperacao), sqlTexto(c.creditoOperacaoAntecedente), sqlBool(c.indReducao),
      sqlBool(c.indDiferimento),
    ]),
  );
  const nomes = inserts(
    "ClassificacaoNomenclatura",
    ["tipo", "codigo", "cClassTrib", "excecao", "itemLc116", "cIndOp", "inicioVigencia", "fimVigencia"],
    nomenclaturas.map((n) => [
      sqlTexto(n.tipo), sqlTexto(n.codigo), sqlTexto(n.cClassTrib), sqlBool(n.excecao), sqlTexto(n.itemLc116),
      sqlTexto(n.cIndOp), sqlData(n.inicioVigencia), sqlData(n.fimVigencia),
    ]),
    500,
  );

  const sql = [
    cabecalho,
    "",
    "-- recarga completa: a migration de uma release nova substitui a anterior",
    'DELETE FROM "ClassificacaoNomenclatura";',
    'DELETE FROM "ClassificacaoTributaria";',
    "",
    classificacoes,
    "",
    nomes,
    "",
  ].join("\n");
  return { sql, avisos };
}

const { repo, saida } = argumentos();
const { sql, avisos } = gerarSql(repo);
for (const a of avisos) console.error(`aviso: ${a}`);
if (saida) {
  writeFileSync(saida, sql);
  console.error(`SQL gravado em ${saida} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB).`);
} else {
  process.stdout.write(sql);
}
