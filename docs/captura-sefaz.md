# Captura automática de NF-e na Sefaz

O sistema busca sozinho, no Ambiente Nacional da NF-e, as notas que fornecedores emitiram contra o CNPJ da
empresa. Elas aparecem em **Lançamentos → NF-e recebidas**, prontas para lançar pelo fluxo de importação de XML.
O ADMIN configura em **Empresa** (dados, certificado A1, liga/desliga) e acompanha em **Captura Sefaz**.

## Como funciona

```
Cloud Scheduler (a cada 20 min, OIDC) ──POST──► /api/sefaz/sincronizar (Cloud Run)
                                                 │ trava por CNPJ + janela de 1 h guardada no banco
                                                 ├─ NFeDistribuicaoDFe (distNSU, TLS com o certificado A1)
                                                 │    resNFe   → DocumentoSefaz (só resumo)
                                                 │    procNFe  → DocumentoSefaz (XML completo, guardado no Storage)
                                                 │    evento   → cancelamento marca a nota como cancelada
                                                 └─ NFeRecepcaoEvento4: Ciência da Operação (210210) dos resumos
Painel /sefaz (ADMIN) ◄── CursorSefaz · ExecucaoSefaz · DocumentoSefaz
Caixa /notas/recebidas (ADMIN, ESCRITÓRIO) ──"Lançar"──► /notas/importar-xml já preenchido
```

1. **Distribuição por NSU** (NT 2014.002). Cada documento da fila tem um número sequencial (NSU). A consulta
   parte sempre do `ultNSU` da resposta anterior, guardado em `CursorSefaz`.
2. **Resumo → Ciência → XML completo.** Para o destinatário, a Sefaz primeiro entrega só o resumo (`resNFe`):
   emitente, valor, data e chave. O sistema registra a **Ciência da Operação** sozinho, e o XML completo
   (`procNFe`) chega numa consulta seguinte, em geral em 1 a 2 horas. A Ciência só diz que a empresa sabe
   da nota. Não confirma a compra, e a manifestação conclusiva continua possível depois.
3. **Lançar.** Em NF-e recebidas, "Lançar" abre a importação de XML com o arquivo já carregado. Ao
   importar, a nota sai da caixa. Se o lançamento for excluído, ela volta.

A chave da NF-e liga as duas pontas. Uma nota já lançada antes (por XML, foto ou formulário) entra direto como
"Lançada". Uma nota lançada depois pela foto ou pelo formulário também sai da caixa.

Ficam de fora:
- **NFC-e (modelo 65).** A Sefaz não distribui NFC-e e, desde 2026, ela não pode ser emitida para CNPJ.
  Continua entrando pela foto ou pelo XML.
- **Notas emitidas pela própria empresa** (mesma raiz de CNPJ), como devolução ou remessa.
- **Notas em que a empresa aparece só como transportadora** ou como autorizada a baixar o XML.

## Regras da Sefaz que o sistema respeita

Fonte: NT 2014.002 e as regras de "uso indevido" de 2022. A política fica em `src/services/sefaz/regras.ts`.

| Situação | O que a Sefaz exige | O que o sistema faz |
|---|---|---|
| Fila no fim (`ultNSU == maxNSU`) ou cStat 137 | esperar 1 h | grava `proximaConsultaEm = agora + 61 min` |
| cStat 138 com fila restante | pode continuar | pede o próximo lote na hora (até 8 por execução) |
| cStat 656 (consumo indevido) | CNPJ bloqueado por 1 h; voltar antes zera a contagem | grava `bloqueadoAte = agora + 65 min` e não consulta |
| NSU fora de sequência | bloqueio | trava por CNPJ no banco: duas execuções nunca leem o mesmo NSU |
| Outra rejeição | — | registra ERRO e espera 1 h |

O agendador passa a cada 20 min. Quando a janela ainda não passou, a execução sai na hora, como "pulada", e
não fica no histórico. Na prática, a consulta acontece a cada 61 a 80 min.

## Custo

- **Sefaz:** nada.
- **Cloud Scheduler:** 1 job, dentro dos 3 grátis por conta de faturamento.
- **Cloud Run:** cerca de 2.200 chamadas curtas por mês, dentro da camada gratuita.
- **Banco e Storage:** algumas linhas e XMLs de ~10–50 KB por nota.

## Configurar (uma vez, pela tela Empresa)

Tudo é feito pelo Admin, no menu **Empresa**, sem mexer no Google Cloud.

1. **Ter o certificado.** É preciso o certificado digital **e-CNPJ A1** da empresa, um arquivo `.pfx` ou `.p12`
   com senha. Ele é comprado de uma Autoridade Certificadora da ICP-Brasil (Certisign, Serasa, Valid, Soluti e
   outras), custa em média R$ 150 a R$ 300 por ano e é emitido em nome do representante legal. Se a empresa já
   emite nota fiscal, o contador provavelmente tem um. O tipo **A3** (cartão ou token) não serve: ele não sai do
   aparelho.
2. **Dados da empresa.** Preencha razão social, CNPJ da matriz, CNPJs das filiais (um por linha) e UF, e clique
   em "Salvar dados". Esses CNPJs também conferem o destinatário na leitura de notas, no lugar da variável
   `CNPJS_EMPRESA`.
3. **Certificado.** Escolha o `.pfx`, informe a senha e clique em "Enviar certificado". O sistema confere na hora:
   - a senha;
   - a validade;
   - se o certificado é da mesma raiz de CNPJ da empresa.
4. **Ligar.** Em "Captura de NF-e na Sefaz", marque a busca automática e deixe em **Homologação**. Em
   **Captura Sefaz**, clique em "Consultar agora" e confira o retorno (137 em homologação é normal). Validado,
   volte e troque para **Produção**.

> **Primeira consulta em produção:** a fila começa no NSU 0 e a Sefaz devolve até 90 dias de documentos.
> As primeiras execuções podem trazer dezenas de notas antigas. Descarte as que já foram tratadas fora do
> sistema, ou lance-as.

### Como o certificado é guardado

- O `.pfx` é convertido para PEM pelo `openssl` da imagem (`src/services/sefaz/pfx.ts`). A senha vai por
  variável de ambiente do processo filho, nunca na linha de comando.
- A senha não é guardada.
- O PEM (chave e certificado) fica no banco cifrado com **AES-256-GCM** (`src/lib/cofre.ts`). A chave do cofre,
  `CHAVE_COFRE`, é gerada pelo Terraform e fica no Secret Manager, fora do banco. Quem tem só o banco ou um
  backup não consegue usar o certificado.
- A tela e o painel mostram só titular, CNPJ e validade, nunca a chave.
- Remover o certificado desliga a captura. Trocar a `CHAVE_COFRE` torna o certificado guardado ilegível: o
  painel avisa para enviar o `.pfx` de novo.

### Infraestrutura (uma vez, por quem administra o Google Cloud)

`./infra/bootstrap.sh SEU_PROJECT_ID` cria:
- o secret `gestao-obras-chave-cofre`;
- a service account do agendador;
- o job do Cloud Scheduler (a cada 20 min);
- o alerta por e-mail de falhas e bloqueio.

Rode **antes** de publicar esta versão, senão o envio do certificado falha por falta da `CHAVE_COFRE`. Com a
captura desligada na tela, cada chamada do agendador termina na hora. Para desligar o agendador:
`sefaz_agendador = false`.

### Certificado da Sefaz não reconhecido

Se a consulta falhar com erro de certificado do **servidor** ("unable to get local issuer certificate"),
a raiz ICP-Brasil do servidor da Sefaz não está na base do Node. Baixe a cadeia em
<https://acraiz.icpbrasil.gov.br> e informe em `sefaz_ca_pem = file("icp-brasil.pem")`. Ela vai na
variável `SEFAZ_CA_PEM`.

## Renovar o certificado (todo ano)

O painel e o dashboard avisam 30 dias antes do vencimento. Em **Empresa**, envie o `.pfx` novo com a senha.
Vale na hora. O cursor (NSU) não muda com a troca: a fila continua de onde parou.

## Desenvolvimento local

Sem `CHAVE_COFRE`, fora de produção, a chave do cofre é derivada do `AUTH_SECRET`. Basta cadastrar a empresa e
enviar um `.pfx` pela tela. Para disparar a rota à mão:

```bash
# .env
SEFAZ_TOKEN_TESTE=um-token-qualquer   # só fora de produção

curl -X POST -H "Authorization: Bearer um-token-qualquer" http://localhost:3000/api/sefaz/sincronizar
```

## Variáveis

| Variável | Para quê |
|---|---|
| `CHAVE_COFRE` | chave AES-256 (base64, 32 bytes) que cifra o certificado no banco (Secret Manager) |
| `SEFAZ_AGENDADOR_EMAIL` | service account cujo token OIDC é aceito na rota |
| `SEFAZ_CA_PEM` | opcional: cadeia ICP-Brasil extra para o TLS |
| `SEFAZ_TOKEN_TESTE` | só fora de produção: token fixo para disparar à mão |
| `SEFAZ_HABILITADO`, `SEFAZ_AMBIENTE`, `SEFAZ_CERT_PEM`, `SEFAZ_UF_AUTOR`, `CNPJS_EMPRESA` | só sem cadastro na tela Empresa: configuração por variável (instalação antiga e testes) |

## Arquivos

- **`src/services/sefaz/`:**
  - `regras.ts`: janela, bloqueio e limites;
  - `xml.ts`: envelopes SOAP e leitura do retorno;
  - `assinatura.ts`: evento de Ciência assinado (XMLDSig);
  - `certificado.ts`, `pfx.ts` e `config.ts`: leitura e conversão do certificado e configuração (cadastro da empresa ou variáveis);
  - `cliente.ts`: chamadas HTTPS com TLS mútuo;
  - `sincronizar.ts`: o orquestrador;
  - `painel.ts`: consultas do painel e alertas.
- **`src/app/api/sefaz/sincronizar/route.ts`:** gatilho do agendador.
- **`src/app/(app)/empresa/`:** cadastro da empresa, certificado e liga/desliga da captura.
- **`src/lib/cofre.ts`:** cifra AES-256-GCM dos segredos guardados no banco.
- **`src/app/(app)/sefaz/`:** painel do ADMIN.
- **`src/app/(app)/notas/recebidas/`:** caixa de NF-e recebidas.
- **`infra/terraform/scheduler.tf`:** agendador. A chave do cofre, as variáveis e o alerta ficam em `secrets.tf`,
  `cloud_run.tf` e `monitoring.tf`.

## Limitações conhecidas

- **CNPJ alfanumérico (NT 2025):** a consulta e o certificado já aceitam letras no CNPJ, mas o leitor de XML
  (`nfe-xml.ts`) ainda exige chave de acesso só com dígitos.
- **Manifestação conclusiva:** "Confirmação da Operação", "Desconhecimento" ou "Operação não Realizada" ainda
  é feita fora do sistema, no portal da Sefaz ou no ERP do contador.
- **Outros documentos:** CT-e e NFS-e não são capturados.
