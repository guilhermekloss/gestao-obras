/**
 * Integração da extração no modo "local": OCR de verdade (tesseract.js),
 * códigos de verdade (zxing-wasm) e PDFs gerados na hora.
 */
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encerrarMotores, extrairTexto, motorOcr, MSG_PDF_SEM_TEXTO } from "../index";
import { MSG_IMAGEM_INVALIDA } from "../imagem";
import { MSG_PDF_INVALIDO } from "../pdf";
import { codigoPng, imagemDocumento, pdfComTexto, pdfEscaneado } from "./geradores";
import type { TextoExtraido } from "../../tipos";

const CHAVE = "35261034567890000195550010000123451123456789";
const BOLETO = "34196123400001543901091234567880057123457000";
const URL_NFCE = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|2|1|1|ABCDEF0123456789`;

const LINHAS_DOC: [string, number, boolean?][] = [
  ["MATERIAIS DE CONSTRUÇÃO SÃO JOÃO LTDA", 30, true],
  ["CNPJ 34.567.890/0001-95", 26],
  ["VALOR TOTAL DA NOTA 1.543,90", 26],
  ["Emissão 15/10/2026", 26],
];

const textos = (r: TextoExtraido) => r.paginas.flatMap((p) => p.linhas.map((l) => l.texto));

let documentoPng: Buffer;

beforeAll(async () => {
  delete process.env.OCR_MOTOR;
  const codigos = [
    await codigoPng("Code128", CHAVE, 2, 100),
    await codigoPng("ITF", BOLETO, 2, 100),
    await codigoPng("QRCode", URL_NFCE, 4),
  ];
  documentoPng = await imagemDocumento(1200, LINHAS_DOC, codigos);
});

afterAll(async () => {
  await encerrarMotores();
});

describe("motorOcr", () => {
  it("padrão é local; 'vision' liga o Cloud Vision", () => {
    const antes = process.env.OCR_MOTOR;
    try {
      delete process.env.OCR_MOTOR;
      expect(motorOcr()).toBe("local");
      process.env.OCR_MOTOR = " Vision ";
      expect(motorOcr()).toBe("vision");
      process.env.OCR_MOTOR = "outro";
      expect(motorOcr()).toBe("local");
    } finally {
      if (antes === undefined) delete process.env.OCR_MOTOR;
      else process.env.OCR_MOTOR = antes;
    }
  });
});

describe("foto (OCR local)", () => {
  it("lê o texto em português e os três códigos (Code-128 da chave, ITF do boleto, QR da NFC-e)", async () => {
    const r = await extrairTexto(documentoPng, "image/png");
    expect(r.origem).toBe("ocr-local");
    const t = textos(r);
    expect(t).toContain("MATERIAIS DE CONSTRUÇÃO SÃO JOÃO LTDA");
    expect(t).toContain("CNPJ 34.567.890/0001-95");
    expect(t).toContain("VALOR TOTAL DA NOTA 1.543,90");
    expect(t).toContain("Emissão 15/10/2026");
    expect(r.confiancaMedia).toBeGreaterThan(0.5);
    expect(r.codigos).toEqual(
      expect.arrayContaining([
        { formato: "CODE128", texto: CHAVE, pagina: 1 },
        { formato: "ITF", texto: BOLETO, pagina: 1 },
        { formato: "QR", texto: URL_NFCE, pagina: 1 },
      ]),
    );
    const linha = r.paginas[0].linhas.find((l) => l.texto.startsWith("VALOR TOTAL"))!;
    expect(linha.caixa.x).toBeGreaterThan(0);
    expect(linha.caixa.x + linha.caixa.largura).toBeLessThanOrEqual(1);
    expect(linha.palavras.every((p) => p.confianca != null)).toBe(true);
  });

  it("aplica a orientação do EXIF (foto tirada de lado)", async () => {
    const texto = await imagemDocumento(900, LINHAS_DOC.slice(1, 3));
    // pixels deitados + EXIF 6 ("girar 90° horário para exibir")
    const deitada = await sharp(texto).rotate(-90).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toBuffer();
    const r = await extrairTexto(deitada, "image/jpeg");
    const t = textos(r);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatch(/^CNPJ\S? 34\.567\.890\/0001-95$/); // o JPEG às vezes vira "CNPJ)"
    expect(t[1]).toBe("VALOR TOTAL DA NOTA 1.543,90");
    expect(r.codigos).toEqual([]);
  });

  it("arquivo que não é imagem dá mensagem amigável", async () => {
    await expect(extrairTexto(Buffer.from("não sou uma imagem"), "image/jpeg")).rejects.toThrow(MSG_IMAGEM_INVALIDA);
  });
});

describe("PDF", () => {
  it("PDF digital: usa a camada de texto e preserva as colunas da linha de produto", async () => {
    const colunas = [30, 80, 250, 310, 350, 380, 420, 470];
    const produto = ["000123", "CIMENTO CP II-E-32 50KG", "25232910", "5102", "SC", "40,000", "34,90", "1.396,00"];
    const pdf = pdfComTexto([
      ["DANFE", 30, 800, 14],
      ["MATERIAIS DE CONSTRUÇÃO SÃO JOÃO LTDA", 30, 780, 9],
      ["VALOR TOTAL DA NOTA", 30, 760, 8],
      ["1.543,90", 400, 760, 8],
      ["DADOS DOS PRODUTOS / SERVIÇOS", 30, 420, 7],
      ...produto.map((c, i): [string, number, number, number] => [c, colunas[i], 400, 7]),
    ]);
    const r = await extrairTexto(pdf, "application/pdf");
    expect(r.origem).toBe("pdf-texto");
    expect(r.confiancaMedia).toBeNull();
    expect(textos(r)).toEqual([
      "DANFE",
      "MATERIAIS DE CONSTRUÇÃO SÃO JOÃO LTDA",
      "VALOR TOTAL DA NOTA  1.543,90",
      "DADOS DOS PRODUTOS / SERVIÇOS",
      "000123  CIMENTO CP II-E-32 50KG  25232910  5102  SC  40,000  34,90  1.396,00",
    ]);
    const danfe = r.paginas[0].linhas[0];
    expect(danfe.caixa.x).toBeCloseTo(30 / 595, 3);
    expect(danfe.caixa.y).toBeLessThan(0.1); // origem no topo
    expect(danfe.palavras[0].confianca).toBeNull();
  });

  it("PDF escaneado (só imagem): OCR local da imagem embutida e códigos dela", async () => {
    const r = await extrairTexto(await pdfEscaneado(documentoPng), "application/pdf");
    expect(r.origem).toBe("ocr-local");
    expect(textos(r)).toContain("VALOR TOTAL DA NOTA 1.543,90");
    expect(r.paginas[0].numero).toBe(1);
    expect(r.codigos).toEqual(expect.arrayContaining([{ formato: "QR", texto: URL_NFCE, pagina: 1 }]));
  });

  it("PDF sem texto e sem imagem sugere mandar foto", async () => {
    await expect(extrairTexto(pdfComTexto([]), "application/pdf")).rejects.toThrow(MSG_PDF_SEM_TEXTO);
  });

  it("PDF corrompido dá mensagem amigável", async () => {
    await expect(extrairTexto(Buffer.from("%PDF-1.4 lixo"), "application/pdf")).rejects.toThrow(MSG_PDF_INVALIDO);
  });
});
