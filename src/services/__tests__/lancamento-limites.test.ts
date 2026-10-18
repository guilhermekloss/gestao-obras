import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { formatarMoeda } from "@/lib/format";
import { CHAVE, comoPrisma, lancamento, novoBanco, type Banco } from "./lancamento-banco";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const {
  avisoDataCompraFutura,
  descricaoDoLancamento,
  documentoDaPlanilha,
  erroDeRegras,
  gravarLancamento,
  numeroDoLancamento,
  registrarLancamento,
} = await import("../lancamento");

const item = lancamento().itens[0];
const p2002 = (target?: string[], code = "P2002") =>
  new Prisma.PrismaClientKnownRequestError("unique", { code, clientVersion: "x", meta: target ? { target } : undefined });

describe("descricaoDoLancamento", () => {
  it("monta o texto do histórico com o rótulo do tipo e o valor", () => {
    const valor = formatarMoeda(12_345);
    expect(descricaoDoLancamento("Lançou", { tipoDocumento: "NF", numero: "46", totalCents: 12_345 }, "Ferragens Silva")).toBe(
      `Lançou a NF 46 — Ferragens Silva (${valor})`,
    );
    expect(descricaoDoLancamento("Excluiu", { tipoDocumento: "RECIBO", numero: "REC-0002", totalCents: 12_345 }, "João")).toBe(
      `Excluiu o recibo REC-0002 — João (${valor})`,
    );
  });
});

describe("regras sem banco: limites", () => {
  it("numeroDoLancamento mantém os zeros fora da NF", () => {
    expect(numeroDoLancamento("RECIBO", "000123")).toBe("000123");
  });

  it("rateio vazio tem mensagem própria", () => {
    expect(erroDeRegras(lancamento({ rateios: [] }))).toBe("Defina o rateio entre obras");
  });

  it("duas obras diferentes no rateio passam", () => {
    const rateios = [
      { obraId: "o1", fracaoBp: 5_000 },
      { obraId: "o2", fracaoBp: 5_000 },
    ];
    expect(erroDeRegras(lancamento({ rateios }))).toBeNull();
  });

  it("documentoDaPlanilha cita o documento sem os espaços", () => {
    expect(documentoDaPlanilha(" 123 ")).toEqual({ aviso: 'CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos) ("123")' });
  });

  it("avisoDataCompraFutura só aceita a data no começo do texto", () => {
    expect(avisoDataCompraFutura("x2999-01-15", new Date(2026, 9, 17, 12))).toBeNull();
  });
});

describe("registrarLancamento: recusas antes de gravar", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });

  it("devolve o erro de regra sem tocar no banco", async () => {
    expect(await registrarLancamento(lancamento({ rateios: [] }), {}, comoPrisma(db))).toEqual({
      ok: false,
      erro: "Defina o rateio entre obras",
    });
    expect(db.notaFiscal.findFirst).not.toHaveBeenCalled();
  });

  it("fornecedor novo com CNPJ inválido é recusado", async () => {
    const l = lancamento({ fornecedor: { novo: { nome: "Novo", cnpj: "11222333000182" } } });
    expect(await registrarLancamento(l, {}, comoPrisma(db))).toEqual({ ok: false, erro: "CNPJ inválido — confira os dígitos" });
  });

  it("fornecedor novo com CNPJ já cadastrado é recusado", async () => {
    db.fornecedor.findFirst.mockResolvedValue({ id: "f9", nome: "Ferragens Silva", cnpj: "11.222.333/0001-81" });
    const l = lancamento({ fornecedor: { novo: { nome: "Novo", cnpj: "11222333000181" } } });
    expect(await registrarLancamento(l, {}, comoPrisma(db))).toEqual({
      ok: false,
      erro: 'CNPJ/CPF já cadastrado para "Ferragens Silva"',
    });
  });

  it("recibo repetido explica que dá para deixar o número em branco", async () => {
    db.notaFiscal.findFirst.mockResolvedValue({ id: "n7" });
    const r = await registrarLancamento(lancamento({ tipoDocumento: "RECIBO", numero: "REC-0001" }), {}, comoPrisma(db));
    expect(r).toEqual({
      ok: false,
      erro: "Já existe um lançamento nº REC-0001 deste fornecedor. Use outro número ou deixe em branco para gerar automaticamente.",
      notaExistenteId: "n7",
    });
  });

  it("NF repetida pede para conferir se já foi lançada", async () => {
    db.notaFiscal.findFirst.mockResolvedValue({ id: "n7" });
    expect(await registrarLancamento(lancamento(), {}, comoPrisma(db))).toEqual({
      ok: false,
      erro: "Já existe a NF 123 deste fornecedor. Confira se a nota não foi lançada antes.",
      notaExistenteId: "n7",
    });
  });

  it("procura o número como digitado, sem os espaços, além do normalizado", async () => {
    await registrarLancamento(lancamento({ numero: " 000123 " }), { forcar: true }, comoPrisma(db));
    const { where } = db.notaFiscal.findFirst.mock.calls[0][0] as { where: { numero: { in: string[] } } };
    expect([...where.numero.in].sort()).toEqual(["000123", "123"]);
  });

  it("na edição a própria nota não conta como repetida", async () => {
    await registrarLancamento(lancamento({ id: "nota-1" }), { forcar: true }, comoPrisma(db));
    expect(db.notaFiscal.findFirst.mock.calls[0][0]).toMatchObject({ where: { NOT: { id: "nota-1" } } });
  });

  it("sem número (recibo automático) ou com fornecedor novo não procura repetido", async () => {
    await registrarLancamento(lancamento({ tipoDocumento: "RECIBO", numero: "" }), { forcar: true }, comoPrisma(db));
    await registrarLancamento(lancamento({ fornecedor: { novo: { nome: "Novo" } } }), { forcar: true }, comoPrisma(db));
    expect(db.notaFiscal.findFirst).not.toHaveBeenCalled();
  });

  it("só confere materiais quando algum item tem material, e aceita os que existem", async () => {
    await registrarLancamento(lancamento(), {}, comoPrisma(db));
    expect(db.material.count).not.toHaveBeenCalled();

    db.material.count.mockResolvedValue(1);
    const l = lancamento({ itens: [{ ...item, materialId: "m1" }, { ...item, materialId: "m1" }], totalCents: 20_000, parcelas: [{ numero: 1, valorCents: 20_000, vencimento: "2026-11-01" }] });
    expect(await registrarLancamento(l, {}, comoPrisma(db))).toMatchObject({ ok: true });
  });

  it("chave de acesso com dígito errado é recusada", async () => {
    const r = await registrarLancamento(lancamento({ chaveNfe: CHAVE.slice(0, 43) + "1" }), {}, comoPrisma(db));
    expect(r).toEqual({ ok: false, erro: "Chave de acesso inválida" });
  });

  it("chave nova passa e grava", async () => {
    expect(await registrarLancamento(lancamento({ chaveNfe: CHAVE }), {}, comoPrisma(db))).toMatchObject({ ok: true });
  });
});

describe("registrarLancamento: avisos", () => {
  it("a pergunta tem o aviso e a confirmação separados por linha em branco", async () => {
    const r = await registrarLancamento(
      lancamento({ totalCents: 12_000, parcelas: [{ numero: 1, valorCents: 12_000, vencimento: "2026-11-01" }] }),
      {},
      comoPrisma(novoBanco()),
    );
    expect(r).toEqual({
      ok: false,
      aviso: true,
      erro: `Soma dos itens (${formatarMoeda(10_000)}) difere do valor total (${formatarMoeda(12_000)}).\n\nSalvar mesmo assim?`,
    });
  });

  it("criação não consulta parcelas; edição sem parcela paga mexida grava direto", async () => {
    const db = novoBanco();
    await registrarLancamento(lancamento(), {}, comoPrisma(db));
    expect(db.parcela.findMany).not.toHaveBeenCalled();

    db.parcela.findMany.mockResolvedValue([
      { numero: 1, valorCents: 10_000, vencimento: new Date(2026, 10, 1, 12), status: "PAGA", pagaEm: new Date(2026, 10, 1, 12) },
    ]);
    expect(await registrarLancamento(lancamento({ id: "nota-1" }), {}, comoPrisma(db))).toMatchObject({ ok: true });
  });
});

describe("registrarLancamento: corrida (P2002), limites", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });

  it("índice do CNPJ do fornecedor tem mensagem própria", async () => {
    db.notaFiscal.create.mockRejectedValue(p2002(["cnpj"]));
    expect(await registrarLancamento(lancamento(), {}, comoPrisma(db))).toEqual({
      ok: false,
      erro: "Já existe um fornecedor com este CNPJ/CPF.",
    });
  });

  it("recibo automático que colidiu pede para salvar de novo", async () => {
    db.notaFiscal.create.mockRejectedValue(p2002(["fornecedorId", "numero"]));
    const r = await registrarLancamento(lancamento({ tipoDocumento: "RECIBO", numero: "" }), { forcar: true }, comoPrisma(db));
    expect(r).toEqual({ ok: false, erro: "Não foi possível gerar o número do lançamento. Tente salvar de novo." });
  });

  it("outro código do Prisma não é traduzido, mesmo citando o índice", async () => {
    db.notaFiscal.create.mockRejectedValue(p2002(["chaveNfe"], "P2003"));
    await expect(registrarLancamento(lancamento(), {}, comoPrisma(db))).rejects.toThrow("unique");
  });

  it("erro comum com code P2002 não é confundido com o do Prisma", async () => {
    db.notaFiscal.create.mockRejectedValue(Object.assign(new Error("outro"), { code: "P2002", meta: { target: ["chaveNfe"] } }));
    await expect(registrarLancamento(lancamento(), {}, comoPrisma(db))).rejects.toThrow("outro");
  });

  it("P2002 sem meta é relançado como veio", async () => {
    db.notaFiscal.create.mockRejectedValue(p2002());
    await expect(registrarLancamento(lancamento(), {}, comoPrisma(db))).rejects.toThrow("unique");
  });
});

describe("gravarLancamento: limites", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });
  const tx = () => db as never;

  it("fornecedor que sumiu vira 'fornecedor' no retorno", async () => {
    db.fornecedor.findUnique.mockResolvedValue(null);
    expect(await gravarLancamento(tx(), lancamento())).toMatchObject({ fornecedorNome: "fornecedor" });
  });

  it("fornecedor novo inválido derruba a transação com a mensagem", async () => {
    await expect(
      gravarLancamento(tx(), lancamento({ fornecedor: { novo: { nome: "Novo", cnpj: "123" } } })),
    ).rejects.toThrow("CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos)");
  });

  it("só gera número para tipo sem número obrigatório e sem número digitado", async () => {
    expect(await gravarLancamento(tx(), lancamento({ numero: "" }))).toMatchObject({ numero: "" });
    expect(await gravarLancamento(tx(), lancamento({ tipoDocumento: "RECIBO", numero: "REC-0009" }))).toMatchObject({ numero: "REC-0009" });
    expect(db.notaFiscal.findMany).not.toHaveBeenCalled();
  });

  it("campos opcionais vazios gravam null; preenchidos gravam o valor", async () => {
    await gravarLancamento(tx(), lancamento({ obs: "", anexoUrl: "", anexoNome: "", chaveNfe: "" }));
    expect(db.notaFiscal.create.mock.calls[0][0]).toMatchObject({
      data: { obs: null, anexoUrl: null, anexoNome: null, chaveNfe: null, createdBy: "u1" },
    });
    expect(db.documentoSefaz.updateMany).not.toHaveBeenCalled();

    await gravarLancamento(tx(), lancamento({ obs: "entrega parcial", anexoUrl: "gs://a.pdf", anexoNome: "a.pdf", chaveNfe: CHAVE }));
    expect(db.notaFiscal.create.mock.calls[1][0]).toMatchObject({
      data: { obs: "entrega parcial", anexoUrl: "gs://a.pdf", anexoNome: "a.pdf", chaveNfe: CHAVE },
    });
  });

  it("NF-e com chave sai da caixa de recebidas da Sefaz", async () => {
    await gravarLancamento(tx(), lancamento({ chaveNfe: CHAVE }));
    expect(db.documentoSefaz.updateMany).toHaveBeenCalledWith({
      where: { chave: CHAVE, status: { not: "LANCADA" } },
      data: { status: "LANCADA", notaFiscalId: "nota-1" },
    });
  });

  it("grava cada linha do rateio, com etapa vazia como null", async () => {
    await gravarLancamento(
      tx(),
      lancamento({ rateios: [{ obraId: "o1", etapaId: "e1", fracaoBp: 6_000 }, { obraId: "o2", etapaId: "", fracaoBp: 4_000 }] }),
    );
    expect(db.rateioNota.createMany).toHaveBeenCalledWith({
      data: [
        { notaId: "nota-1", obraId: "o1", etapaId: "e1", fracaoBp: 6_000 },
        { notaId: "nota-1", obraId: "o2", etapaId: null, fracaoBp: 4_000 },
      ],
    });
  });

  it("na edição troca itens e rateio e atualiza a própria nota", async () => {
    await gravarLancamento(tx(), lancamento({ id: "nota-9" }));
    expect(db.itemNota.deleteMany).toHaveBeenCalledWith({ where: { notaId: "nota-9" } });
    expect(db.rateioNota.deleteMany).toHaveBeenCalledWith({ where: { notaId: "nota-9" } });
    expect(db.notaFiscal.update.mock.calls[0][0]).toMatchObject({ where: { id: "nota-9" }, data: { numero: "123" } });
    expect(db.notaFiscal.create).not.toHaveBeenCalled();
  });

  it("na edição reconcilia as parcelas: mantém, atualiza, remove e cria", async () => {
    const venc = (d: number) => new Date(2026, 10, d, 12);
    db.parcela.findMany.mockResolvedValue([
      { numero: 1, valorCents: 3_000, vencimento: venc(1), status: "PAGA", pagaEm: venc(1) },
      { numero: 2, valorCents: 3_000, vencimento: venc(2), status: "ABERTA", pagaEm: null },
      { numero: 3, valorCents: 4_000, vencimento: venc(3), status: "ABERTA", pagaEm: null },
    ]);
    await gravarLancamento(
      tx(),
      lancamento({
        id: "nota-9",
        parcelas: [
          { numero: 1, valorCents: 3_000, vencimento: "2026-11-01" },
          { numero: 2, valorCents: 3_500, vencimento: "2026-11-02" },
          { numero: 4, valorCents: 3_500, vencimento: "2026-11-04" },
        ],
      }),
    );
    expect(db.parcela.deleteMany).toHaveBeenCalledWith({ where: { notaId: "nota-9", numero: { in: [3] } } });
    expect(db.parcela.update).toHaveBeenCalledTimes(1);
    expect(db.parcela.update).toHaveBeenCalledWith({
      where: { notaId_numero: { notaId: "nota-9", numero: 2 } },
      data: { valorCents: 3_500, vencimento: venc(2), status: "ABERTA", pagaEm: null },
    });
    expect(db.parcela.createMany).toHaveBeenCalledWith({
      data: [{ notaId: "nota-9", numero: 4, valorCents: 3_500, vencimento: venc(4), pagaEm: null, status: "ABERTA" }],
    });
  });

  it("na criação não remove nem atualiza parcelas", async () => {
    await gravarLancamento(tx(), lancamento());
    expect(db.parcela.deleteMany).not.toHaveBeenCalled();
    expect(db.parcela.update).not.toHaveBeenCalled();
  });

  it("edição sem parcela nova não chama createMany", async () => {
    db.parcela.findMany.mockResolvedValue([
      { numero: 1, valorCents: 10_000, vencimento: new Date(2026, 10, 1, 12), status: "ABERTA", pagaEm: null },
    ]);
    await gravarLancamento(tx(), lancamento({ id: "nota-9" }));
    expect(db.parcela.createMany).not.toHaveBeenCalled();
    expect(db.parcela.deleteMany).not.toHaveBeenCalled();
  });
});

describe("gravarLancamento: materiais dos itens", () => {
  let db: Banco;
  beforeEach(() => {
    db = novoBanco();
  });
  const tx = () => db as never;
  const materiaisGravados = () =>
    (db.itemNota.createMany.mock.calls[0][0] as { data: { materialId: string | null }[] }).data.map((i) => i.materialId);

  it("material escolhido vai direto, mesmo com materialNovo junto", async () => {
    await gravarLancamento(tx(), lancamento({ itens: [{ ...item, materialId: "m1", materialNovo: { nome: "Outro", unidade: "un" } }] }));
    expect(materiaisGravados()).toEqual(["m1"]);
    expect(db.material.create).not.toHaveBeenCalled();
  });

  it("material novo com o nome de um existente reaproveita o existente", async () => {
    db.material.findFirst.mockResolvedValue({ id: "m-areia", nome: "Areia" });
    await gravarLancamento(tx(), lancamento({ itens: [{ ...item, materialNovo: { nome: "Areia", unidade: "m³" } }] }));
    expect(materiaisGravados()).toEqual(["m-areia"]);
    expect(db.material.create).not.toHaveBeenCalled();
  });

  it("material novo é criado com o nome sem espaços, unidade normalizada e tipo MATERIAL", async () => {
    await gravarLancamento(tx(), lancamento({ itens: [{ ...item, materialNovo: { nome: "  Areia  ", unidade: " sc " } }] }));
    expect(db.material.findFirst.mock.calls[0][0]).toMatchObject({ where: { nome: { equals: "Areia" } } });
    expect(db.material.create.mock.calls[0][0]).toMatchObject({ data: { nome: "Areia", unidade: "SC", tipo: "MATERIAL" } });
  });

  it("se o material aparecer no meio do caminho, a transação cai com a mensagem", async () => {
    db.material.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "m-areia", nome: "Areia" });
    await expect(
      gravarLancamento(tx(), lancamento({ itens: [{ ...item, materialNovo: { nome: "Areia", unidade: "m³" } }] })),
    ).rejects.toThrow('Já existe o material "Areia".');
  });

  it("item sem material não registra apelido", async () => {
    await gravarLancamento(tx(), lancamento({ itens: [{ ...item, descricao: "CIMENTO GENERICO" }] }));
    expect(materiaisGravados()).toEqual([null]);
    expect(db.material.findUnique).not.toHaveBeenCalled();
    expect(db.materialApelido.upsert).not.toHaveBeenCalled();
  });
});
