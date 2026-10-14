# Leitura de nota fiscal (foto, PDF, XML ou manual)

Um só ponto de entrada em **Lançamentos → Nova NF** (`/notas/nova`):

| Entrada | Como é lida | Precisão | Onde |
|---|---|---|---|
| **XML da NF-e** | Parser determinístico (fluxo já existente) | Exata — é o documento fiscal | `services/nfe-xml.ts` + `notas/importar-xml/` |
| **Foto do celular** (DANFE, cupom NFC-e, recibo, boleto, guia) | Claude (visão) → JSON estruturado → conferência | Alta, com avisos do que conferir | `services/leitor-ia.ts` + `services/leitura-documento.ts` |
| **PDF** (DANFE, NFS-e de prefeitura, recibo) | Claude (PDF nativo) → mesmo caminho da foto | Alta | idem |
| **Manual** | Formulário de sempre, logo abaixo da área de envio | — | `notas/nota-form.tsx` |

Em todos os casos o resultado é o **mesmo lançamento** (`NotaFiscal` + `ItemNota` + `RateioNota`
+ `Parcela`), então os dados entram direto em custo por obra/etapa, contas a pagar, curva ABC,
alertas, dashboard e fornecedores — nada novo precisa ser consultado pelas outras telas.

## Fluxo para o usuário

1. **Tirar foto** (abre a câmera traseira no celular) ou **Enviar arquivo** (ou arrastar para a área).
2. XML → tela de importação exata (prévia, rateio, parcelas). Foto/PDF → "Lendo os dados da nota…"
   (10–30 s) e o formulário aparece **preenchido**: fornecedor, número, data, total, itens com tipo
   (material/serviço/frete/encargo), forma de pagamento, parcelas/vencimentos, anexo e chave de acesso.
3. Um quadro mostra o que foi reconhecido e **o que conferir** (avisos). Fornecedor ainda não
   cadastrado aparece com o botão **Cadastrar e usar** (nome e CNPJ já lidos).
4. O usuário escolhe a obra no rateio e salva. **Nada é gravado antes disso.**

Se a leitura falhar (foto ilegível, serviço fora do ar, sem chave da API), o arquivo continua
anexado e o formulário fica aberto para preenchimento manual — o usuário nunca perde o envio.

## Conferências automáticas (por que confiar no que foi lido)

O modelo só **transcreve**; quem decide o que entra é código puro e testado
(`normalizarLeitura`, 27 testes):

- **Chave de acesso** (44 dígitos) só é aceita com o dígito verificador (módulo 11) correto. Ela
  carrega o CNPJ do emitente e o número da nota, que servem de **cruzamento**: se o CNPJ ou o número
  lidos divergem da chave, vale a chave (com aviso).
- **CNPJ/CPF** com dígito verificador inválido não é usado para buscar o fornecedor.
- **Número da NF** normalizado como o `nNF` do XML (`000.012.345` → `12345`), para que a mesma nota
  lida por foto e depois importada por XML seja reconhecida como duplicata.
- **Itens**: o total da linha manda; o unitário é ajustado para reproduzi-lo (mesma regra do XML).
  Unitário muito diferente do total da linha gera aviso. Frete e IPI/ST/outras despesas viram itens
  próprios; desconto geral entra no maior item.
- **Soma dos itens × total**: diferença vira **aviso**, nunca ajuste silencioso — numa foto,
  diferença costuma ser erro de leitura, não arredondamento.
- **Parcelas** do documento só são usadas se fecham com o total; senão são geradas pela forma de pagamento.
- **Datas** inválidas ou no futuro geram aviso. Documento sem itens legíveis entra como item único
  com o total (recibo, guia).
- **Duplicidade**: antes de salvar, a tela avisa se a chave ou fornecedor + número já existem
  (com link para a nota). Ao salvar, `salvarNota` grava a `chaveNfe` e recusa chave repetida.

## Pesquisa: como o mercado resolve e o que foi escolhido

### O que outras soluções fazem
- **ERPs de obra (Sienge, Obra Prima, Vobi)**: o padrão é importar o **XML** da NF-e; a Vobi, por
  exemplo, só aceita XML de NF-e modelo 55 e orienta baixar o XML no portal da NF-e quando falta
  ([Vobi](https://ajuda.vobi.com.br/pt-br/articles/9431811-importacao-manual-de-notas-fiscais-via-xml)).
  Foto e NFS-e de prefeitura ficam de fora — é exatamente o que mais acontece no canteiro.
- **Gestão de despesas (Expensify SmartScan, Ramp, Flash)**: foto → extração (fornecedor, data,
  valor, itens) → **o usuário revisa e confirma**. A Flash destaca leitura de notas e cupons
  amassados e identificação de CNPJ, itens, valor e número
  ([Flash](https://flashapp.com.br/novidades-de-produto/leitura-automatica-ocr),
  [Expensify SmartScan](https://www.mintlify.com/Expensify/App/features/expenses/smartscan),
  [Ramp](https://ramp.com/blog/receipt-scanning-expense-management)).
- **Plataformas fiscais (Qive/Arquivei, NSDocs)**: OCR para NFS-e de prefeituras sem padrão
  (convertidas para XML Abrasf) e **busca automática na SEFAZ** das notas emitidas contra o CNPJ,
  com certificado digital em nuvem ([Qive](https://qive.com.br/blog/ocr),
  [NSDocs](https://nsdocs.com.br/blog/?p=9263)).

### Tecnologias avaliadas

| Opção | Prós | Contras | Decisão |
|---|---|---|---|
| **Tesseract.js / OCR puro** | Grátis, roda no navegador | Só devolve texto solto; ruim com foto torta e tabela de itens; ainda exigiria regras por layout | Descartado |
| **AWS Textract AnalyzeExpense / Azure Document Intelligence / Google Document AI** | Modelos prontos de invoice/receipt | Treinados em notas americanas/europeias, não conhecem DANFE/NFS-e/chave de acesso; custo sobe no nível estruturado ([comparativo](https://invoicedataextraction.com/blog/aws-textract-vs-google-document-ai-vs-azure-document-intelligence)); exigem mapeamento manual de campos | Descartado |
| **Mindee / Veryfi / Nanonets** | APIs de recibo prontas | Mesmos limites de layout brasileiro; mais um fornecedor/contrato | Descartado |
| **LLM com visão (Claude)** | Lê foto e PDF nativamente, entende qualquer layout (DANFE, NFC-e, NFS-e de cada prefeitura, recibo escrito à mão), classifica itens e devolve JSON no schema pedido (saída estruturada) | Custo por leitura; pode errar dígito → **mitigado** pelas conferências acima | **Escolhido** |
| **Leitura do QR Code / código de barras** | Chave exata sem OCR | A chave sozinha não traz itens: baixar o XML pela chave exige certificado digital do destinatário | Fica como evolução (ver abaixo) |
| **SEFAZ — Distribuição DF-e** | O XML oficial de **toda** NF-e emitida contra o CNPJ chega sozinho (últimos 180 dias) | Exige certificado A1 da empresa e manifestação do destinatário; não cobre NFS-e nem recibos ([ACBr](https://www.projetoacbr.com.br/forum/topic/77002-c-consulta-de-notas-por-data/)) | Próximo passo recomendado |

Benchmarks públicos de extração de notas são de fornecedores e se contradizem
([exemplo](https://hackernoon.com/can-your-llm-handle-an-invoice-i-tested-5heres-the-truth));
por isso a decisão se apoia mais na cobertura de layouts brasileiros e na **conferência
determinística** (dígitos verificadores, cruzamento com a chave, somas) do que em um número de
acurácia.

## Configuração

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...        # sem ela: XML e manual funcionam; foto/PDF só ficam anexados
LEITURA_NF_MODELO=claude-opus-5-5   # opcional (padrão). Alternativa mais barata: claude-haiku-5-5
```

- Modelo padrão: `claude-opus-5-5`, esforço `medium`, saída estruturada (schema Zod
  `documentoLidoSchema`) e **fallback automático no servidor** (`fallbacks: "default"`): se o modelo
  principal recusar o pedido, a API repete a leitura num modelo de reserva na mesma chamada.
- Custo estimado por documento (foto reduzida para 2400 px no navegador): alguns milhares de
  tokens de entrada e de saída — na ordem de **US$ 0,05–0,10 por nota** com o Opus e de
  **menos de US$ 0,01** com o Haiku (estimativa; confira no console da Anthropic após as primeiras leituras).
- Privacidade: a imagem/PDF é enviada à API da Anthropic para a leitura. O arquivo continua guardado
  só no storage do app (`./uploads`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/services/leitura-documento.ts` | Puro: schema do que o modelo devolve, dígitos verificadores, `normalizarLeitura` |
| `src/services/leitor-ia.ts` | Chamada ao Claude (imagem/PDF base64, saída estruturada, mensagens de erro amigáveis) |
| `src/app/(app)/notas/nova/actions.ts` | `lerDocumento(url)`: lê o arquivo do storage, normaliza, acha fornecedor e duplicatas — não grava |
| `src/app/(app)/notas/nova/novo-lancamento.tsx` | Tela única: câmera/arquivo/arrastar, progresso, resumo e avisos, formulário preenchido |
| `src/lib/imagem.ts` | Reduz e converte a foto (HEIC/PNG → JPEG, máx. 2400 px) antes do upload |
| `src/app/(app)/notas/nota-form-model.ts` | `valoresDaLeitura` (leitura → valores do formulário) e `chaveNfe` no payload |

## Evoluções sugeridas (em ordem de valor)

1. **Busca automática na SEFAZ (Distribuição DF-e)** com o certificado A1 da empresa: as NF-e de
   material passam a chegar sozinhas, já com XML oficial; a foto fica para NFS-e, cupons e recibos.
2. **Enriquecer pela chave**: quando a foto traz a chave válida e o XML chega depois (SEFAZ ou e-mail),
   substituir os itens lidos pelos do XML.
3. **Lote**: enviar várias fotos/PDFs de uma vez e conferir em fila.
4. **Sugestão de obra/etapa** pelo histórico do fornecedor e pela descrição dos itens.
5. **Recebimento por WhatsApp/e-mail**: encaminhar a foto ou o XML para um endereço e o lançamento
   aparecer pronto para conferência.
