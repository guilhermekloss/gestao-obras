# Fixtures do leitor nativo de documentos

Corpus sintético (dados **fictícios**, DVs calculados) para medir o leitor nativo
(extração → interpretação → `normalizarLeitura`) sem LLM. **Gerado** por
`scripts/leitor-nativo/gerar-corpus.ts` — não edite à mão; mude os dados em
`scripts/leitor-nativo/documentos.ts` e gere de novo.

Para cada documento:

- `<id>.pdf` — PDF digital renderizado pelo Chromium (camada de texto real);
- `<id>.jpg` — "foto": render a ~192 dpi, papel sobre uma mesa, rotação de 1–4°,
  cisalhamento leve, sombra/vinheta, desfoque gaussiano, pretos acinzentados,
  JPEG q≈70, lado maior ≤ 2400 px (o cliente do app já reduz a 2400 px);
- `<id>.esperado.json` — a verdade de referência no formato `DocumentoLido`
  (`src/services/leitura-documento.ts`), validada contra `documentoLidoSchema`,
  com somas conferidas (itens + frete + outras − desconto = total; Σ parcelas = total)
  e aceita por `normalizarLeitura`. `null` = o documento não imprime o campo.

Total: 1156 KB.

## Convenções da verdade de referência

- `numero` como impresso (`000.012.345`, `00004567`); o avaliador compara NF/NFC-e/NFS-e sem zeros à esquerda.
- `chaveAcesso` só para a chave de 44 (NF-e/NFC-e). A chave de 50 da NFS-e nacional **não** entra (fica `null`).
- `valorTotal` da NFS-e = valor bruto do serviço; líquido e retenções vão em `observacoes` (não comparado).
- Guia (DAS): `emitente` = "Simples Nacional" sem documento; o CNPJ impresso é do **contribuinte** (`destinatario`); sem data de emissão impressa (`null`).
- Itens sem quantidade impressa (NFS-e, recibo, composição do DAS) têm `quantidade: null` — o avaliador aceita `null` ou 1.
- Boleto: sem itens; vencimento + valor = a parcela única.
- `legibilidade` é sempre `BOA` (é a verdade do conteúdo, não da foto) e não é comparada.

## Códigos de barras nas fotos

Todos os códigos decodificam (zxing-wasm) do render limpo. Nas fotos, um código
linear de página A4 inteira reduzida a 2400 px fica com ~2 px por módulo: o
Code-128 da chave do DANFE e o ITF do DAS **não** decodificam (de propósito, é o
caso real — o leitor precisa do texto OCR da chave/linha digitável), o ITF do
boleto (foto mais nítida) decodifica, e os QR Codes decodificam.

## Documentos

### `nfe-materiais` — DANFE NF-e (modelo 55) — depósito de materiais, A4 retrato

Arquivos: `nfe-materiais.pdf` (44 KB), `nfe-materiais.jpg` (232 KB), `nfe-materiais.esperado.json` (2 KB)

- tipo **NFE**, total R$ 3.355,32, 7 itens, 2 parcela(s), forma BOLETO
- blocos do DANFE em caixas (rótulo em cima, valor embaixo), canhoto no topo
- chave em 11 grupos de 4 + Code-128C da chave
- 7 itens com NCM/CST/CFOP/UN/QUANT(4 casas)/V.UNIT(4 casas)/V.TOTAL; item 2 com descrição que quebra em 2 linhas e contém "10,0MM"
- quantidades fracionárias (3,5 M3; 5,5 KG); CST 060 sem BC
- frete R$ 120,00 + IPI R$ 19,47 no quadro de totais (vNF = vProd + frete + IPI)
- 2 duplicatas; CNPJ do transportador como distrator; forma BOLETO só nas informações complementares
- foto: +2.4°, desfoque σ 0.9, sombra 32%, JPEG q70; Code128 na foto: não decodifica

### `nfce-ferragens` — DANFE NFC-e (modelo 65) — cupom térmico 80 mm

Arquivos: `nfce-ferragens.pdf` (33 KB), `nfce-ferragens.jpg` (78 KB), `nfce-ferragens.esperado.json` (2 KB)

- tipo **NFCE**, total R$ 98,50, 5 itens, 0 parcela(s), forma PIX
- fonte monoespaçada de impressora térmica; itens em 2 linhas (código+descrição / qtd UN x unit  total)
- desconto no total (R$ 5,00) — Σ itens R$ 103,50 ≠ Valor a Pagar R$ 98,50
- forma de pagamento PIX ("Pagamento Instantâneo (PIX)")
- consumidor identificado por CPF; chave em grupos de 4
- QR Code v2 `...?p=CHAVE|2|1|1|HASH` (hash SHA-1 recalculado com CSC fictício)
- foto: -3.4°, desfoque σ 0.8, sombra 28%, JPEG q70; QRCode na foto: decodifica

### `nfse-nacional` — NFS-e padrão nacional (DANFSe v1.0)

Arquivos: `nfse-nacional.pdf` (37 KB), `nfse-nacional.jpg` (160 KB), `nfse-nacional.esperado.json` (1 KB)

- tipo **NFSE**, total R$ 5.000,00, 1 item, 0 parcela(s), forma NAO_INFORMADA
- chave de acesso de 50 posições (NÃO vai em chaveAcesso, que é a de 44)
- rótulos em linha e valores na linha de baixo (grade de 3/4/6 colunas)
- valores com R$ e '-' como zero; bruto R$ 5.000,00 ≠ líquido R$ 4.200,00 (ISS e INSS retidos)
- descrição do serviço longa (2 linhas) → 1 item SERVICO sem quantidade impressa
- QR Code com URL de consulta da chave
- foto: +1.4°, desfoque σ 1, sombra 35%, JPEG q70; QRCode na foto: decodifica

### `nfse-sp` — NFS-e São Paulo (leiaute municipal próprio)

Arquivos: `nfse-sp.pdf` (33 KB), `nfse-sp.jpg` (142 KB), `nfse-sp.esperado.json` (1 KB)

- tipo **NFSE**, total R$ 1.800,00, 1 item, 0 parcela(s), forma NAO_INFORMADA
- rótulos `Rótulo: valor` na mesma linha, dois por linha (CPF/CNPJ + Inscrição Municipal)
- TOMADOR com nome antes do CNPJ (ordem invertida em relação ao prestador)
- número com zeros à esquerda (00004567) e código de verificação alfanumérico
- `VALOR TOTAL DO SERVIÇO = R$ 1.800,00`; datas distratoras (período do serviço, vencimento do ISS 10/11/2026)
- sem chave, sem QR, sem código de barras (só texto)
- foto: -2.1°, desfoque σ 0.9, sombra 30%, JPEG q70

### `boleto-itau` — Boleto de cobrança (banco 341) — Recibo do Pagador + Ficha de Compensação

Arquivos: `boleto-itau.pdf` (32 KB), `boleto-itau.jpg` (141 KB), `boleto-itau.esperado.json` (1 KB)

- tipo **BOLETO**, total R$ 1.234,56, 0 itens, 1 parcela(s), forma BOLETO
- linha digitável de 47 dígitos (mód. 10 nos 3 campos + DV geral mód. 11) e código de barras ITF de 44
- fator de vencimento do ciclo novo (1615 → 30/10/2026)
- Beneficiário e Pagador repetidos nas duas vias; Nº do Documento `12345/002`
- Data do Documento = dataEmissao; vencimento vira a única parcela; sem itens
- foto: +1.2°, desfoque σ 0.5, sombra 30%, JPEG q70; ITF na foto: decodifica

### `das-simples` — DAS — Documento de Arrecadação do Simples Nacional

Arquivos: `das-simples.pdf` (28 KB), `das-simples.jpg` (104 KB), `das-simples.esperado.json` (2 KB)

- tipo **GUIA**, total R$ 456,78, 6 itens, 1 parcela(s), forma NAO_INFORMADA
- linha de arrecadação de 48 dígitos (segmento 5, id 8 → mód. 11) e ITF de 44
- contribuinte = destinatário (o CNPJ impresso NÃO é do emitente); emitente sem documento
- sem data de emissão impressa (dataEmissao null) — período de apuração por extenso (Setembro/2026)
- composição em 6 linhas → 6 itens ENCARGO; vencimento = parcela única
- foto: -1.8°, desfoque σ 0.9, sombra 30%, JPEG q70; ITF na foto: não decodifica

### `recibo-mao-de-obra` — Recibo impresso de mão de obra (A5 paisagem)

Arquivos: `recibo-mao-de-obra.pdf` (24 KB), `recibo-mao-de-obra.jpg` (60 KB), `recibo-mao-de-obra.esperado.json` (1 KB)

- tipo **RECIBO**, total R$ 1.500,00, 1 item, 0 parcela(s), forma PIX
- texto corrido: `Recebi de … a importância de R$ … (extenso), referente a …`
- data por extenso (`São Paulo, 10 de outubro de 2026`) e datas distratoras no período da medição
- emitente pessoa física (CPF) abaixo da linha de assinatura; pagador com CNPJ no corpo
- forma de pagamento PIX no corpo; item único SERVICO
- foto: +3.1°, desfoque σ 1, sombra 38%, JPEG q70

## Como usar

```bash
# avaliar extração + interpretação sobre estes fixtures (pdf e jpg)
npx tsx scripts/leitor-nativo/avaliar.ts [--motor local|vision] [--json resultado.json]

# regenerar (variantes extras — png limpo e foto-forte — ficam em --saida, fora do repo)
npx tsx scripts/leitor-nativo/gerar-corpus.ts --saida /tmp/leitor-nativo-corpus --fixtures
npx tsx scripts/leitor-nativo/avaliar.ts --dir /tmp/leitor-nativo-corpus
```
