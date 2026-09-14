import { z } from "zod";

export const itemNotaSchema = z.object({
  descricao: z.string().min(1, "Descrição do item é obrigatória"),
  tipo: z.enum(["MATERIAL", "SERVICO", "FRETE", "ENCARGO"]),
  qtde: z.number().positive("Quantidade deve ser positiva"),
  unidade: z.string().min(1, "Unidade é obrigatória"),
  unitCents: z.number().int().min(0),
  descontoCents: z.number().int().min(0).default(0),
});

export const rateioSchema = z.object({
  obraId: z.string().min(1, "Selecione a obra"),
  etapaId: z.string().optional(),
  fracaoBp: z.number().int().min(1).max(10000),
});

export const parcelaSchema = z.object({
  numero: z.number().int().min(1),
  valorCents: z.number().int().min(0),
  vencimento: z.string().min(1, "Vencimento é obrigatório"), // yyyy-mm-dd
});

export const notaSchema = z.object({
  id: z.string().optional(), // presente na edição
  fornecedorId: z.string().min(1, "Selecione o fornecedor"),
  numero: z.string().min(1, "Número da NF é obrigatório"),
  dataCompra: z.string().min(1, "Data da compra é obrigatória"),
  totalCents: z.number().int().positive("Valor total deve ser maior que zero"),
  formaPagto: z.enum(["PIX", "CARTAO", "DEBITO", "BOLETO"]),
  obs: z.string().optional(),
  anexoUrl: z.string().optional(),
  anexoNome: z.string().optional(),
  itens: z.array(itemNotaSchema).min(1, "A nota precisa de ao menos 1 item"),
  rateios: z.array(rateioSchema).min(1, "Defina o rateio entre obras"),
  parcelas: z.array(parcelaSchema).min(1, "A nota precisa de ao menos 1 parcela"),
  /** confirma salvamento apesar de avisos (NF duplicada, divergência itens×total) */
  forcar: z.boolean().optional(),
});

export type NotaInput = z.infer<typeof notaSchema>;
export type ItemNotaInput = z.infer<typeof itemNotaSchema>;
