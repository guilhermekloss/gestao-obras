import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
const construtor = vi.fn();

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor({ message, status }: { message: string; status: number }) {
      super(message);
      this.status = status;
    }
  }
  class GoogleGenAI {
    models = { generateContent };
    constructor(opts: unknown) {
      construtor(opts);
    }
  }
  return { ApiError, GoogleGenAI };
});

const { ApiError } = await import("@google/genai");
const { analisarComGemini, analiseIaDisponivel, interpretarResposta, schemaParaGemini, MODELO_PADRAO } = await import(
  "../leitor-gemini"
);

const DOC = {
  tipo: "RECIBO",
  legibilidade: "BOA",
  emitente: { nome: "João Pedreiro", documento: "12345678909", telefone: null },
  destinatario: { nome: "Construtora", documento: null },
  numero: "42",
  serie: null,
  chaveAcesso: null,
  dataEmissao: "2026-10-10",
  valorTotal: 1500,
  valorFrete: null,
  valorOutrasDespesas: null,
  descontoGeral: null,
  formaPagamento: "PIX",
  itens: [],
  parcelas: [],
  observacoes: null,
};

const ENV = ["GEMINI_PROJETO", "GEMINI_API_KEY", "GEMINI_LOCAL", "GEMINI_MODELO"] as const;
let salvo: Record<string, string | undefined>;

beforeEach(() => {
  salvo = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  ENV.forEach((k) => delete process.env[k]);
  generateContent.mockReset();
  construtor.mockReset();
});
afterEach(() => {
  ENV.forEach((k) => (salvo[k] === undefined ? delete process.env[k] : (process.env[k] = salvo[k])));
});

const resposta = (texto: string, finishReason = "STOP") => ({ text: texto, candidates: [{ finishReason }] });

describe("schemaParaGemini", () => {
  it("só usa palavras-chave de JSON Schema aceitas pelo Gemini", () => {
    const aceitas = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "description", "anyOf"]);
    const usadas = new Set<string>();
    const visitar = (no: unknown, dentroDeProperties = false) => {
      if (!no || typeof no !== "object") return;
      if (Array.isArray(no)) return no.forEach((n) => visitar(n));
      for (const [k, v] of Object.entries(no)) {
        if (!dentroDeProperties) usadas.add(k);
        visitar(v, k === "properties");
      }
    };
    visitar(schemaParaGemini());
    expect([...usadas].filter((k) => !aceitas.has(k))).toEqual([]);
  });
});

describe("interpretarResposta", () => {
  it("valida o JSON contra o schema do DocumentoLido", () => {
    expect(interpretarResposta(JSON.stringify(DOC)).valorTotal).toBe(1500);
  });
  it("JSON quebrado, vazio ou fora do formato vira mensagem para o usuário", () => {
    expect(() => interpretarResposta("{")).toThrow(/incompleta/);
    expect(() => interpretarResposta("")).toThrow(/não devolveu/);
    expect(() => interpretarResposta(JSON.stringify({ ...DOC, tipo: "XPTO" }))).toThrow(/formato inesperado/);
  });
});

describe("analisarComGemini", () => {
  const foto = Buffer.from([0xff, 0xd8, 0xff]);

  it("sem configuração, fica indisponível", async () => {
    expect(analiseIaDisponivel()).toBe(false);
    await expect(analisarComGemini(foto, "image/jpeg")).rejects.toThrow(/não está configurada/);
  });

  it("Vertex AI: projeto + local global, imagem inline e saída JSON pelo schema", async () => {
    process.env.GEMINI_PROJETO = "meu-projeto";
    generateContent.mockResolvedValue(resposta(JSON.stringify(DOC)));
    const lido = await analisarComGemini(foto, "image/jpeg");
    expect(lido.emitente.nome).toBe("João Pedreiro");
    expect(construtor).toHaveBeenCalledWith({ vertexai: true, project: "meu-projeto", location: "global" });
    const pedido = generateContent.mock.calls[0][0];
    expect(pedido.model).toBe(MODELO_PADRAO);
    expect(pedido.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: foto.toString("base64") } });
    expect(pedido.config.responseMimeType).toBe("application/json");
    expect(pedido.config.responseJsonSchema).toEqual(schemaParaGemini());
  });

  it("Gemini API com chave (desenvolvimento) e modelo configurável", async () => {
    process.env.GEMINI_API_KEY = "chave";
    process.env.GEMINI_MODELO = "gemini-3.8-flash";
    generateContent.mockResolvedValue(resposta(JSON.stringify(DOC)));
    await analisarComGemini(foto, "application/pdf");
    expect(construtor).toHaveBeenCalledWith({ apiKey: "chave" });
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-3.8-flash");
  });

  it("resposta cortada ou bloqueada vira mensagem amigável", async () => {
    process.env.GEMINI_API_KEY = "chave";
    generateContent.mockResolvedValueOnce(resposta("{", "MAX_TOKENS"));
    await expect(analisarComGemini(foto, "image/jpeg")).rejects.toThrow(/documento inteiro/);
    generateContent.mockResolvedValueOnce(resposta("", "SAFETY"));
    await expect(analisarComGemini(foto, "image/jpeg")).rejects.toThrow(/não processou/);
  });

  it("erros da API viram mensagens para o usuário", async () => {
    process.env.GEMINI_API_KEY = "chave";
    const casos: [number, RegExp][] = [
      [403, /sem permissão/],
      [429, /Muitas análises/],
      [400, /não pôde ser analisado/],
      [503, /instável/],
    ];
    for (const [status, msg] of casos) {
      generateContent.mockRejectedValueOnce(new ApiError({ message: "x", status }));
      await expect(analisarComGemini(foto, "image/jpeg")).rejects.toThrow(msg);
    }
    generateContent.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(analisarComGemini(foto, "image/jpeg")).rejects.toThrow(/Sem conexão/);
  });
});
