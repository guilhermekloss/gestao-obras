import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnotacaoVision } from "../vision-conversao";

const anotarImagem = vi.fn<(img: Buffer) => Promise<AnotacaoVision[]>>();
const anotarPdf = vi.fn<(pdf: Buffer) => Promise<AnotacaoVision[]>>();

vi.mock("../vision", async (importOriginal) => {
  const original = await importOriginal<typeof import("../vision")>();
  return {
    ...original,
    anotarImagem: (img: Buffer) => anotarImagem(img),
    anotarPdf: (pdf: Buffer) => anotarPdf(pdf),
    anotarImagens: () => Promise.reject(new Error("não esperado")),
  };
});
vi.mock("../tesseract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tesseract")>()),
  reconhecer: () => Promise.reject(new Error("o modo vision não pode usar o Tesseract")),
}));

const { extrairTexto, encerrarMotores } = await import("../index");
const { codigoPng, imagemDocumento, pdfComTexto, pdfEscaneado } = await import("./geradores");

const URL_NFCE = "https://www.nfce.fazenda.sp.gov.br/qrcode?p=35261034567890000195550010000123451123456789|2|1|1|ABC";

function anotacao(pageNumber?: number): AnotacaoVision {
  const w = (text: string, x0: number, x1: number, quebra: string) => ({
    confidence: 0.98,
    boundingBox: { vertices: [{ x: x0, y: 100 }, { x: x1, y: 100 }, { x: x1, y: 130 }, { x: x0, y: 130 }] },
    symbols: [...text].map((t, i) => ({
      text: t,
      ...(i === text.length - 1 ? { property: { detectedBreak: { type: quebra } } } : {}),
    })),
  });
  return {
    fullTextAnnotation: {
      pages: [
        {
          width: 1000,
          height: 1000,
          blocks: [
            {
              paragraphs: [
                {
                  words: [
                    w("Valor", 40, 120, "SPACE"),
                    w("a", 130, 145, "SPACE"),
                    w("pagar", 155, 240, "SPACE"),
                    w("R$", 250, 290, "SPACE"),
                    w("91,30", 300, 380, "LINE_BREAK"),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    ...(pageNumber ? { context: { pageNumber } } : {}),
  };
}

let imagem: Buffer;

beforeAll(async () => {
  imagem = await imagemDocumento(800, [["Valor a pagar R$ 91,30", 26]], [await codigoPng("QRCode", URL_NFCE, 4)]);
});

beforeEach(() => {
  process.env.OCR_MOTOR = "vision";
  anotarImagem.mockReset();
  anotarPdf.mockReset();
});

afterEach(() => {
  delete process.env.OCR_MOTOR;
});

afterAll(async () => {
  await encerrarMotores();
});

describe("modo vision", () => {
  it("foto: manda JPEG ao Vision, monta as linhas e lê o QR localmente", async () => {
    anotarImagem.mockResolvedValue([anotacao()]);
    const r = await extrairTexto(imagem, "image/png");
    expect(anotarImagem).toHaveBeenCalledOnce();
    const enviado = anotarImagem.mock.calls[0][0];
    expect(enviado.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG
    expect(r.origem).toBe("ocr-vision");
    expect(r.paginas).toHaveLength(1);
    expect(r.paginas[0].linhas.map((l) => l.texto)).toEqual(["Valor a pagar R$ 91,30"]);
    expect(r.confiancaMedia).toBeCloseTo(0.98);
    expect(r.codigos).toEqual([{ formato: "QR", texto: URL_NFCE, pagina: 1 }]);
  });

  it("PDF escaneado: manda o próprio PDF (files:annotate)", async () => {
    anotarPdf.mockResolvedValue([anotacao(1)]);
    const pdf = await pdfEscaneado(imagem);
    const r = await extrairTexto(pdf, "application/pdf");
    expect(anotarPdf).toHaveBeenCalledWith(pdf);
    expect(r.origem).toBe("ocr-vision");
    expect(r.paginas[0].linhas[0].texto).toBe("Valor a pagar R$ 91,30");
    expect(r.codigos).toEqual([{ formato: "QR", texto: URL_NFCE, pagina: 1 }]);
  });

  it("PDF digital não chama o Vision", async () => {
    const pdf = pdfComTexto([
      ["DOCUMENTO DE ARRECADACAO DO SIMPLES NACIONAL", 30, 800, 10],
      ["Valor Total do Documento 1.234,56", 30, 780, 10],
    ]);
    const r = await extrairTexto(pdf, "application/pdf");
    expect(r.origem).toBe("pdf-texto");
    expect(anotarPdf).not.toHaveBeenCalled();
  });

  it("erro na resposta do Vision vira mensagem amigável", async () => {
    anotarImagem.mockResolvedValue([{ error: { code: 3, message: "Bad image data." } }]);
    await expect(extrairTexto(imagem, "image/png")).rejects.toThrow(/não pôde ser lido/);
  });

  it("PDF escaneado sem nenhum texto no Vision sugere mandar foto", async () => {
    anotarPdf.mockResolvedValue([{ context: { pageNumber: 1 } }]);
    await expect(extrairTexto(await pdfEscaneado(imagem), "application/pdf")).rejects.toThrow(/foto/);
  });
});
