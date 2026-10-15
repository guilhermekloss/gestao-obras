# Leitura de nota fiscal (foto, PDF, XML ou manual)

Um só ponto de entrada em **Lançamentos → Nova NF** (`/notas/nova`):

| Entrada | Como é lida | Precisão | Onde |
|---|---|---|---|
| **XML da NF-e** | Parser determinístico (fluxo já existente) | Exata — é o documento fiscal | `services/nfe-xml.ts` + `notas/importar-xml/` |
| **PDF digital** (DANFE, NFS-e, boleto, guia, recibo) | Camada de texto do PDF → regras por tipo de documento → conferência | Exata na prática (99% dos campos no corpus) | `services/leitor-nativo/` + `services/leitura-documento.ts` |
| **Foto do celular** ou PDF escaneado | Código de barras/QR + OCR (Tesseract local ou Cloud Vision) → mesmas regras | Boa, com avisos do que conferir (81% dos campos no corpus; ver abaixo) | idem |
| **Manual** | Formulário de sempre, logo abaixo da área de envio | — | `notas/nota-form.tsx` |

Em todos os casos o resultado é o **mesmo lançamento** (`NotaFiscal` + `ItemNota` + `RateioNota`
+ `Parcela`), então os dados entram direto em custo por obra/etapa, contas a pagar, curva ABC,
alertas, dashboard e fornecedores — nada novo precisa ser consultado pelas outras telas.

## Fluxo para o usuário

1. **Tirar foto** (abre a câmera traseira no celular) ou **Enviar arquivo** (ou arrastar para a área).
2. XML → tela de importação exata (prévia, rateio, parcelas). Foto/PDF → "Lendo os dados da nota…"
   (menos de 1 s para PDF, alguns segundos para foto) e abre o **pop-up "Conferir dados da nota"**.
3. No pop-up, o documento fica ao lado (foto ou PDF) e **todos os dados que vão entrar no sistema**
   ficam editáveis: tipo, número, data, total, chave, fornecedor, destinatário, itens, pagamento e
   obra (rateio). Os avisos da leitura aparecem no topo; somas de itens, parcelas e rateio ficam
   verdes quando fecham.
4. O usuário marca **"Conferi os dados com o documento"** e clica em **Confirmar e lançar**. Só então
   o fornecedor é resolvido e a nota é gravada. Fechar o pop-up não grava nada (o botão **Conferir
   dados** reabre com as edições preservadas).
5. Casos fora do comum: **Editar no formulário completo** leva tudo para o formulário de sempre.

Se a leitura falhar (foto ilegível, PDF escaneado sem texto, fila de leitura cheia), o arquivo continua
anexado e o formulário fica aberto para preenchimento manual — o usuário nunca perde o envio.

## Conferência humana: o que bloqueia o "Confirmar"

`errosConferencia` (`notas/nova/conferencia-model.ts`, testado) lista o que falta, com o campo e o que fazer:
- fornecedor não decidido (há cadastros parecidos), sem nome, ou CNPJ/CPF com dígito verificador inválido;
  NF exige o CNPJ/CPF do emitente;
- número (NF), data de emissão válida e valor total;
- itens com descrição, quantidade e unidade, e **soma dos itens = total**;
- parcelas com valor e vencimento, e **soma das parcelas = total**;
- obra em todas as linhas do rateio e **rateio = 100%**;
- a caixa "Conferi os dados com o documento" marcada.

Documento já lançado (mesma chave, ou mesmo fornecedor + número) desabilita o botão e mostra o link da nota.

## Integridade de fornecedores e envolvidos

A correspondência entre o emitente lido e o cadastro (`services/correspondencia-fornecedor.ts`) mostra:

| Situação | O que o pop-up oferece |
|---|---|
| Mesmo CNPJ/CPF (com ou sem máscara) | Já escolhido: "mesmo CNPJ/CPF — já cadastrado". Se o nome do cadastro for bem diferente do da nota, um aviso pede conferência (o nome do cadastro é mantido). |
| Nome parecido **sem CNPJ/CPF** no cadastro | "Usar <cadastro>" + **gravar o CNPJ/CPF lido neste cadastro** (marcado por padrão) — completa o cadastro em vez de duplicar. |
| Mesmo CNPJ raiz (8 dígitos) | "mesma empresa, outra filial" — usar o cadastro existente ou cadastrar a filial. |
| Nome parecido com **outro** CNPJ/CPF | Mostrado para conferência (outra empresa ou documento mal lido). |
| Nenhum parecido | "Cadastrar novo fornecedor" com nome e CNPJ/CPF editáveis e selo de validade ao vivo. |
| Qualquer outro | "Escolher outro fornecedor cadastrado" — busca por nome ou CNPJ. |

O usuário precisa escolher quando há parecidos — o sistema não decide sozinho. A similaridade de nomes
ignora acentos, caixa e sufixos (Ltda, ME, EPP, EIRELI, S/A).

Regras do cadastro (valem também para o cadastro manual de fornecedores, a criação rápida na nota e a
importação de XML — `validarDocumentoFornecedor`):
- CNPJ/CPF com dígito verificador inválido é recusado;
- gravado sempre com máscara (`11.222.333/0001-81`);
- **não pode repetir** em outro fornecedor, com ou sem máscara;
- na edição, um documento antigo que não mudou continua aceito (não trava cadastros antigos).

**Destinatário / tomador** (quem comprou ou contratou) também é lido e conferido: selo de CNPJ/CPF
válido e, com `CNPJS_EMPRESA` configurado, a confirmação de que a nota é da empresa (aceita filiais)
ou o aviso de que foi emitida para outro CNPJ. Ele é exibido para conferência e não é gravado.

## Conferências automáticas (por que confiar no que foi lido)

O leitor só **transcreve**; quem decide o que entra é código puro e testado
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

## Como o leitor nativo funciona

Sem LLM e sem API de IA de terceiros. Duas etapas com um contrato entre elas
(`services/leitor-nativo/tipos.ts`):

```
arquivo ──extração──► TextoExtraido (linhas com posição + códigos lidos) ──interpretação──► DocumentoLido ──► normalizarLeitura
```

**Extração** (`leitor-nativo/extracao/`):

| Entrada | Como | Custo |
|---|---|---|
| PDF digital | `unpdf` (pdf.js) lê a camada de texto com coordenadas; as linhas preservam as colunas da tabela | ~0,1 s, só CPU |
| Foto | `sharp` (rotação EXIF, tamanho, tons de cinza) → OCR | 1–6 s |
| PDF escaneado | imagens embutidas → OCR (local) ou o próprio PDF → Vision `files:annotate` | idem |
| Código de barras / QR | `zxing-wasm` (Code-128, ITF, QR) na foto e nas imagens do PDF | < 0,2 s |

- **OCR local (padrão)**: `tesseract.js` 7 com o modelo `por` (best_int) lido do disco — nunca baixa de CDN. Um único
  worker reaproveitado e reciclado (o heap WASM não encolhe), fila de **uma leitura por vez** e no máximo 5 esperando
  (acima disso o usuário recebe "muitas leituras ao mesmo tempo"). Pico medido: ~480 MB — cabe no 1 GiB do Cloud Run.
- **Cloud Vision** (`OCR_MOTOR=vision`): `DOCUMENT_TEXT_DETECTION` via REST, autenticado pela service account do
  Cloud Run. Não usa memória da instância para o OCR.

**Interpretação** (`leitor-nativo/interpretacao/`, pura e testada): classifica o documento (âncoras com dígito
verificador primeiro — chave modelo 55/65, linha digitável de boleto ou de arrecadação — depois palavras-chave) e
aplica o intérprete do tipo: DANFE, NFC-e, NFS-e (nacional e municipais), boleto, guia (DAS/DARF/GPS), recibo e um
genérico. Os rótulos impressos ("VALOR TOTAL DA NOTA", "Valor do Documento"...) ancoram os valores; tudo que tem
dígito verificador é árbitro: chave de acesso, CNPJ/CPF e linha digitável. Erros típicos de OCR (O↔0, l↔1, S↔5)
só são corrigidos quando exatamente uma correção faz o dígito verificador fechar.

Convenções: NFS-e usa o valor **bruto** do serviço como total, com o líquido e as retenções (ISS, INSS) nas
observações; DAS entra com emitente "Simples Nacional" e o CNPJ impresso como destinatário (contribuinte); boleto e
guia tiram valor e vencimento do código de barras quando ele fecha.

### Qualidade medida (corpus sintético)

`npm run leitor:avaliar` lê os 7 documentos de `src/services/leitor-nativo/__fixtures__/` (DANFE com 7 itens,
NFC-e, NFS-e nacional e de São Paulo, boleto, DAS e recibo — cada um em PDF e em "foto" com rotação, sombra e blur)
e compara com o gabarito campo a campo. Resultado com o OCR local:

| | Campos corretos | Tempo médio |
|---|---|---|
| PDF | 139/140 (99%) | 0,1 s |
| Foto | 114/140 (81%) | 3,9 s |

Na foto, o ponto fraco é a **tabela de itens do DANFE** (letra miúda em A4 inteiro): o cabeçalho, a chave e o total
saem, os itens nem sempre. A conferência humana continua obrigatória, e o Vision ou o PDF/XML resolvem esse caso.
`npm run leitor:corpus` regenera os documentos.

## Análise com IA (Gemini), a pedido do usuário

No topo do pop-up de conferência aparece o **índice de acerto da leitura** (`indiceAcerto`, em
`conferencia-model.ts`, testado): a fração dos campos-chave que vieram lidos e coerentes — nome e CNPJ/CPF
válido do emitente, número, chave de acesso (NF-e/NFC-e), data, total e itens que somam o total — menos 8
pontos por aviso da leitura (até 40). **Alto** ≥ 85%, **médio** ≥ 60%, **baixo** abaixo disso; o painel
lista o que não foi lido.

Com o Gemini configurado, o painel mostra o botão **Analisar com IA** — em destaque quando o índice é médio
ou baixo. Ao clicar (e confirmar), o mesmo arquivo é enviado ao Gemini, que devolve o `DocumentoLido` pela
saída estruturada (`responseJsonSchema` gerado do schema Zod). A resposta passa pelas **mesmas conferências**
da leitura nativa (`normalizarLeitura`, fornecedor, duplicata, destinatário) e substitui os dados da tela;
**obra e rateio escolhidos pelo usuário são mantidos**. Nada é gravado sem o "Confirmar e lançar".

- Só roda com a ação do usuário — a leitura nativa continua sendo a padrão (custo zero).
- `src/services/leitor-gemini.ts` (SDK `@google/genai`): Vertex AI em produção, autenticado pela service
  account do Cloud Run (papel `roles/aiplatform.user`, sem chave guardada); `GEMINI_API_KEY` só para
  desenvolvimento local.
- **Custo — barato primeiro**: lê com `gemini-3.5-flash-lite` (US$ 0,30 / 2,50 por milhão de tokens de
  entrada / saída) e só repete com `gemini-3.5-flash` (US$ 1,50 / 9,00) quando a leitura não fecha — total
  ausente, itens + frete + outras − desconto ≠ total, ou imagem quase ilegível (`leituraFecha`). Estimativa por foto
  de nota (alguns milhares de tokens de entrada e de saída, incluindo o raciocínio do modelo): **abaixo de
  US$ 0,01 (~R$ 0,05)** no Flash-Lite e ~US$ 0,04 quando o reforço entra — confira no faturamento após as
  primeiras análises. Troque com
  `GEMINI_MODELO` / `GEMINI_MODELO_REFORCO` (vazio desliga o reforço).
- Privacidade: ao clicar, a imagem/PDF é enviada ao Google (Vertex AI, local `global`).

## Configuração

```bash
# .env
OCR_MOTOR=local                     # local (padrão) | vision | desligado (foto/PDF só anexados)
GEMINI_PROJETO=meu-projeto-gcp      # opcional: botão "Analisar com IA" via Vertex AI (ou GEMINI_API_KEY=... no dev)
GEMINI_MODELO=gemini-3.5-flash-lite # opcional (padrão): lê primeiro, o mais barato
GEMINI_MODELO_REFORCO=gemini-3.5-flash  # opcional (padrão): só quando a leitura barata não fecha; vazio desliga
CNPJS_EMPRESA=12.345.678/0001-95    # opcional: CNPJs da empresa (vírgula) para conferir o destinatário
```

- Privacidade: com `local`, o arquivo não sai do servidor. Com `vision`, a imagem vai para o Google Cloud Vision
  (processada fora do Brasil).
- Custo: `local` só usa a CPU da própria instância; `vision` tem 1.000 leituras grátis por mês e US$ 1,50 a cada
  1.000 depois.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/services/leitura-documento.ts` | Puro: schema `DocumentoLido`, dígitos verificadores, `normalizarLeitura` |
| `src/services/leitor-nativo/index.ts` | `lerDocumentoNativo`: extração → interpretação; `leituraAutomaticaDisponivel` |
| `src/services/leitor-gemini.ts` | Análise com IA a pedido do usuário: Gemini (Vertex AI) → `DocumentoLido` |
| `src/services/leitor-nativo/tipos.ts` | Contrato entre as etapas (`TextoExtraido`) |
| `src/services/leitor-nativo/extracao/` | PDF (unpdf), imagem (sharp), códigos (zxing-wasm), OCR (Tesseract / Vision), fila do processo |
| `src/services/leitor-nativo/interpretacao/` | Classificação, rótulos, normalização de valores/datas, intérpretes por tipo |
| `scripts/leitor-nativo/` | Gerador do corpus sintético e avaliador de ponta a ponta |
| `src/app/(app)/notas/nova/actions.ts` | `lerDocumento(url)`: lê, normaliza, faz a correspondência de fornecedor e acha duplicatas — não grava; `resolverFornecedor`: usa/completa/cria sem duplicar |
| `src/app/(app)/notas/nova/novo-lancamento.tsx` | Tela única: câmera/arquivo/arrastar, progresso, abre a conferência |
| `src/app/(app)/notas/nova/conferencia-dialog.tsx` | Pop-up de conferência: documento ao lado, campos editáveis, escolha do fornecedor, confirmar e lançar |
| `src/app/(app)/notas/nova/conferencia-model.ts` | Estado inicial da conferência e `errosConferencia` (o que bloqueia confirmar) |
| `src/services/correspondencia-fornecedor.ts` | Emitente × cadastro (mesmo documento, filial, nome parecido), destinatário × empresa, CNPJ/CPF do cadastro |
| `src/lib/imagem.ts` | Reduz e converte a foto (HEIC/PNG → JPEG, máx. 2400 px) antes do upload |
| `src/app/(app)/notas/nota-form-model.ts` | `valoresDaLeitura` (leitura → valores do formulário) e `chaveNfe` no payload |

## Evoluções sugeridas (em ordem de valor)

1. **CNPJ alfanumérico** (emitido desde julho de 2026): a interpretação já reconhece e valida
   (`interpretacao/digitos.ts`), mas `leitura-documento.ts`, o cadastro de fornecedores e o XML ainda só aceitam
   dígitos — ajustar os três juntos.
1. **Busca automática na SEFAZ (Distribuição DF-e)** com o certificado A1 da empresa: as NF-e de
   material passam a chegar sozinhas, já com XML oficial; a foto fica para NFS-e, cupons e recibos.
2. **Enriquecer pela chave**: quando a foto traz a chave válida e o XML chega depois (SEFAZ ou e-mail),
   substituir os itens lidos pelos do XML.
3. **Lote**: enviar várias fotos/PDFs de uma vez e conferir em fila.
4. **Sugestão de obra/etapa** pelo histórico do fornecedor e pela descrição dos itens.
5. **Recebimento por WhatsApp/e-mail**: encaminhar a foto ou o XML para um endereço e o lançamento
   aparecer pronto para conferência.
