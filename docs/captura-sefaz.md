# Captura automática de NF-e na Sefaz

O sistema busca sozinho, no Ambiente Nacional da NF-e, as notas que fornecedores emitiram contra o CNPJ da
empresa. Elas aparecem em **Lançamentos → NF-e recebidas**, prontas para lançar pelo fluxo de importação de XML.
O ADMIN acompanha tudo em **Captura Sefaz** (menu).

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

## Configurar (uma vez)

### 1. Converter o certificado A1 para PEM

O A1 vem em `.pfx`/`.p12`. O app lê PEM (chave privada + certificado), sem biblioteca de PKCS#12.
No seu computador:

```bash
# -legacy é necessário no OpenSSL 3 para a maioria dos .pfx de autoridades ICP-Brasil
openssl pkcs12 -in certificado.pfx -nodes -legacy -out a1.pem
# confira: tem que aparecer "PRIVATE KEY" e "CERTIFICATE"
grep -c "BEGIN" a1.pem
```

Prefere a chave cifrada também dentro do Secret Manager? Tire o `-nodes` e informe a senha em
`SEFAZ_CERT_SENHA` (variável extra no Cloud Run). O secret já é cifrado em repouso, com acesso só da service
account do app e leitura registrada no log de auditoria, então a chave sem senha é o padrão.

### 2. Gravar no Secret Manager

O Terraform cria o secret vazio (`gestao-obras-sefaz-cert-pem`). A versão é gravada à mão, para a chave
nunca passar pelo state do Terraform:

```bash
gcloud secrets versions add gestao-obras-sefaz-cert-pem --data-file=a1.pem
shred -u a1.pem   # apague a cópia local
```

### 3. Ligar, primeiro em homologação

No `terraform.tfvars`:

```hcl
cnpjs_empresa    = "12.345.678/0001-90"   # matriz e filiais, separadas por vírgula (mesma raiz do certificado)
sefaz_habilitado = true
sefaz_ambiente   = "homologacao"
sefaz_uf_autor   = "41"                    # Paraná
```

Depois rode `./infra/bootstrap.sh SEU_PROJECT_ID`. O Terraform:
- ativa o Cloud Scheduler;
- cria a service account do agendador e o job;
- passa as variáveis e o secret ao Cloud Run;
- cria o alerta por e-mail de falhas repetidas e de bloqueio.

Em **Captura Sefaz**, clique em "Consultar agora", confira o retorno (137 em homologação é normal) e veja o
certificado. Validado, troque para `sefaz_ambiente = "producao"` e rode o bootstrap de novo.

> **Primeira consulta em produção:** a fila começa no NSU 0 e a Sefaz devolve até 90 dias de documentos.
> As primeiras execuções podem trazer dezenas de notas antigas. Descarte as que já foram tratadas fora do
> sistema, ou lance-as.

### Certificado da Sefaz não reconhecido

Se a consulta falhar com erro de certificado do **servidor** ("unable to get local issuer certificate"),
a raiz ICP-Brasil do servidor da Sefaz não está na base do Node. Baixe a cadeia em
<https://acraiz.icpbrasil.gov.br> e informe em `sefaz_ca_pem = file("icp-brasil.pem")`. Ela vai na
variável `SEFAZ_CA_PEM`.

## Renovar o certificado (todo ano)

O painel e o dashboard avisam 30 dias antes do vencimento. Para renovar:
1. Repita os passos 1 e 2 com o `.pfx` novo.
2. Force uma revisão nova do Cloud Run, que lê a versão `latest` do secret ao subir:

   ```bash
   gcloud run services update gestao-obras --region southamerica-east1 --update-labels=cert=$(date +%s)
   ```

O cursor (NSU) não muda com a troca: a fila continua de onde parou.

## Desenvolvimento local

```bash
# .env
SEFAZ_HABILITADO=true
SEFAZ_AMBIENTE=homologacao
SEFAZ_CERT_PEM="$(cat a1.pem)"        # ou com \n escapados numa linha só
CNPJS_EMPRESA=12345678000190
SEFAZ_TOKEN_TESTE=um-token-qualquer   # só fora de produção

curl -X POST -H "Authorization: Bearer um-token-qualquer" http://localhost:3000/api/sefaz/sincronizar
```

## Variáveis

| Variável | Para quê |
|---|---|
| `SEFAZ_HABILITADO` | `true` liga a captura |
| `SEFAZ_AMBIENTE` | `homologacao` (padrão) ou `producao` |
| `SEFAZ_CERT_PEM` | chave privada + certificado A1 em PEM (Secret Manager) |
| `SEFAZ_CERT_SENHA` | opcional: senha da chave, se ela estiver cifrada |
| `SEFAZ_UF_AUTOR` | código IBGE da UF da empresa (`41` = PR, padrão) |
| `SEFAZ_CA_PEM` | opcional: cadeia ICP-Brasil extra para o TLS |
| `SEFAZ_AGENDADOR_EMAIL` | service account cujo token OIDC é aceito na rota |
| `SEFAZ_TOKEN_TESTE` | só fora de produção: token fixo para disparar à mão |
| `CNPJS_EMPRESA` | CNPJs consultados (os de raiz diferente da do certificado são ignorados e apontados no painel) |

## Arquivos

- **`src/services/sefaz/`:**
  - `regras.ts`: janela, bloqueio e limites;
  - `xml.ts`: envelopes SOAP e leitura do retorno;
  - `assinatura.ts`: evento de Ciência assinado (XMLDSig);
  - `certificado.ts` e `config.ts`: certificado e configuração;
  - `cliente.ts`: chamadas HTTPS com TLS mútuo;
  - `sincronizar.ts`: o orquestrador;
  - `painel.ts`: consultas do painel e alertas.
- **`src/app/api/sefaz/sincronizar/route.ts`:** gatilho do agendador.
- **`src/app/(app)/sefaz/`:** painel do ADMIN.
- **`src/app/(app)/notas/recebidas/`:** caixa de NF-e recebidas.
- **`infra/terraform/scheduler.tf`:** agendador. O secret, as variáveis e o alerta ficam em `secrets.tf`,
  `cloud_run.tf` e `monitoring.tf`.

## Limitações conhecidas

- **CNPJ alfanumérico (NT 2025):** a consulta e o certificado já aceitam letras no CNPJ, mas o leitor de XML
  (`nfe-xml.ts`) ainda exige chave de acesso só com dígitos.
- **Manifestação conclusiva:** "Confirmação da Operação", "Desconhecimento" ou "Operação não Realizada" ainda
  é feita fora do sistema, no portal da Sefaz ou no ERP do contador.
- **Outros documentos:** CT-e e NFS-e não são capturados.
