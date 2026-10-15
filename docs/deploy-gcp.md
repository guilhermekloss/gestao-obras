# Deploy no Google Cloud

Produção roda no Google Cloud, em São Paulo (`southamerica-east1`). A infraestrutura está descrita em código (`infra/terraform/`), e o deploy é automático pelo GitHub Actions a cada merge na `main`.

## Arquitetura

```
GitHub (main) ──► GitHub Actions ──OIDC──► Workload Identity Federation (sem chave guardada)
                   │  CI: lint, tipos, testes, migrations, build, e2e, imagem Docker
                   │  Deploy: imagens ► migrations ► revisão sem tráfego ► smoke test ► 100%
                   ▼
            Artifact Registry ──► Cloud Run "gestao-obras" (Next.js, escala 0–3)
                                     │  socket Unix /cloudsql (Auth Proxy embutido, IAM)
                                     ├──► Cloud SQL PostgreSQL 17 (backups diários + PITR 7 dias)
                                     ├──► Cloud Storage (fotos/anexos, privado, versionado)
                                     └──► Secret Manager (DATABASE_URL, AUTH_SECRET)
            Cloud Run job "gestao-obras-migrate" ──► prisma migrate deploy
            Monitoring: uptime check em /api/health, alertas por e-mail, orçamento mensal
```

| Recurso | Configuração padrão | Custo aproximado/mês* |
|---|---|---|
| Cloud Run | 1 vCPU, 1 GiB, escala a zero, CPU só durante requisições | US$ 0–5 (uso de escritório) |
| Cloud SQL | `db-f1-micro`, 10 GB SSD, zonal, backups + PITR | US$ 12–15 |
| Cloud Storage, Artifact Registry, Secret Manager, Monitoring | — | < US$ 2 |

\*Estimativa para poucas dezenas de usuários. O orçamento configurado avisa por e-mail aos 50%, 90% e 100% (contando o custo real, sem descontar os créditos).

## Primeira configuração (uma vez só)

### 1. Projeto no Google Cloud

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um **projeto dedicado** (ex.: `gestao-obras-prod`) e vincule a conta de faturamento que tem os créditos.
2. Ative a verificação em duas etapas na sua conta Google — ela é dona de tudo.

### 2. Rodar o bootstrap no Cloud Shell

Abra o **Cloud Shell** (ícone `>_` no topo do console; já tem `gcloud` e `terraform`):

```bash
# o repositório é privado: use um token do GitHub (fine-grained, só leitura deste repo) como senha
git clone https://github.com/guilhermekloss/gestao-obras.git && cd gestao-obras

./infra/bootstrap.sh SEU_PROJECT_ID
```

Na primeira vez ele cria o bucket do estado do Terraform e o arquivo `infra/terraform/terraform.tfvars`. Edite-o:

```bash
gcloud billing accounts list                    # copie o ID para billing_account_id
nano infra/terraform/terraform.tfvars           # billing_account_id, email_alertas
./infra/bootstrap.sh SEU_PROJECT_ID             # agora aplica (revise o plano e digite "yes")
```

A criação do Cloud SQL leva ~10 minutos. No fim, o script imprime quatro variáveis.

### 3. Conectar o GitHub

No GitHub: **Settings → Secrets and variables → Actions → aba Variables → New repository variable**, cadastre as quatro que o bootstrap imprimiu:

| Variável | Exemplo |
|---|---|
| `GCP_PROJECT_ID` | `gestao-obras-prod` |
| `GCP_REGION` | `southamerica-east1` |
| `GCP_WIF_PROVIDER` | `projects/123456/locations/global/workloadIdentityPools/github/providers/github-oidc` |
| `GCP_DEPLOYER_SA` | `gestao-obras-deployer@gestao-obras-prod.iam.gserviceaccount.com` |

São variáveis, não segredos: nenhuma delas dá acesso sozinha. O GCP só aceita o token de um workflow **deste repositório** rodando na **branch `main`**.

Recomendado em **Settings → Branches → Add rule** para `main`: exigir PR e os checks do CI ("Lint, tipos, testes, build e e2e", "Imagem Docker", "Terraform") antes do merge.

### 4. Primeiro deploy

Faça o merge na `main` (ou rode **Actions → Deploy → Run workflow**). Ao final, a URL aparece no job e em **Settings → Environments → production**.

### 5. Criar o administrador

O banco começa vazio. Rode o seed pelo job de migrations com uma senha **temporária** forte:

```bash
gcloud run jobs execute gestao-obras-migrate --region southamerica-east1 --wait \
  --args="node_modules/.bin/tsx,prisma/seed.ts" \
  --update-env-vars="SEED_ADMIN_EMAIL=voce@suaempresa.com.br,SEED_ADMIN_SENHA=uma-senha-temporaria-longa"
```

O seed cria o admin e os 6 lotes com etapas padrão. **Entre no app e troque a senha na tela Usuários** (os parâmetros de uma execução ficam visíveis no console para quem tem acesso ao projeto). Em produção o seed se recusa a usar a senha padrão `admin123`.

### 6. Leitura automática de nota

Já vem ligada, com OCR **local** (Tesseract dentro do próprio app, sem serviço externo nem chave). Para trocar,
coloque no `terraform.tfvars` e rode `./infra/bootstrap.sh SEU_PROJECT_ID` de novo:

- `motor_ocr = "vision"` — Google Cloud Vision: mais preciso em foto, ~1–2 s, 1.000 leituras grátis/mês e
  US$ 1,50 a cada 1.000 depois. A API é ativada pelo Terraform e a service account do app autentica sem chave.
  A imagem é processada fora do Brasil (o Vision não tem região na América do Sul) — registre isso para a LGPD.
- `motor_ocr = "desligado"` — foto/PDF só ficam anexados (o XML continua sendo lido).

PDF digital (com texto) é lido sem OCR, em qualquer opção.

## Dia a dia

- **Deploy**: merge na `main`. O CI roda de novo; se passar, as migrations são aplicadas, a nova revisão sobe **sem tráfego**, passa por um smoke test na URL própria dela e só então recebe 100% dos acessos. Se qualquer passo falhar, os usuários continuam na versão anterior.
- **Voltar uma versão**: *Actions → Rollback* (sem rebuild, em segundos). Passo a passo e regras do fluxo em [`fluxo-de-trabalho.md`](fluxo-de-trabalho.md).
- **Logs**: Console → Cloud Run → gestao-obras → Logs (ou Logging → Logs Explorer).
- **Mudar a infraestrutura** (máquina do banco, instâncias, alertas): edite `infra/terraform/`, abra PR (o CI valida), faça o merge e rode `./infra/bootstrap.sh SEU_PROJECT_ID` no Cloud Shell.
- **Migrations**: rodam antes da nova versão entrar no ar, e a versão anterior continua atendendo durante o deploy. Por isso, mudanças destrutivas (renomear/apagar coluna) vão em dois deploys: primeiro o código para de usar a coluna, depois a migration a remove.

### Acessar o banco do seu computador

Para rodar os scripts de importação (`prisma/importar-*.ts`) ou um cliente SQL, use o [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) — o banco não aceita conexões diretas:

```bash
gcloud auth application-default login
cloud-sql-proxy SEU_PROJECT_ID:southamerica-east1:gestao-obras-pg --port 6543
# senha: gcloud secrets versions access latest --secret gestao-obras-database-url
DATABASE_URL="postgresql://app:SENHA@localhost:6543/gestao_obras" npx tsx prisma/importar-dados-reais.ts
```

### Backups e restauração

Backup automático diário (retenção de 14) + point-in-time recovery dos últimos 7 dias. Para restaurar: Console → SQL → gestao-obras-pg → Backups. Prefira **restaurar numa instância nova** (clone para um horário), conferir e só então apontar o app. Fotos e anexos têm versionamento no bucket: versões apagadas ou substituídas ficam 90 dias.

## Segurança — o que já está configurado

- **Sem chaves de service account**: o GitHub autentica por OIDC (Workload Identity Federation), restrito ao ID numérico deste repositório e à branch `main`. PRs e forks não obtêm credenciais.
- **Menor privilégio**: uma service account por função — app (banco, seus segredos, gravar/ler no bucket, sem apagar), migrations (só banco) e deploy (publicar imagem, atualizar o serviço, agir como as duas anteriores).
- **Banco sem exposição**: nenhuma rede autorizada e certificado de cliente obrigatório — só conecta pelo Auth Proxy, autenticado via IAM. Proteção contra exclusão ligada.
- **Segredos** no Secret Manager, replicados só no Brasil; nunca no repositório nem nas variáveis do GitHub.
- **Arquivos** em bucket privado com bloqueio de acesso público, servidos só via `/api/fotos` com sessão.
- **Container** sem root, imagem mínima (Next standalone), base fixada por digest; tags imutáveis no Artifact Registry.
- **Cabeçalhos HTTP**: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Cadeia de suprimentos**: GitHub Actions fixadas por SHA, Dependabot (npm, Actions, Docker, Terraform) e `npm audit` bloqueando vulnerabilidade crítica.
- **Operação**: uptime check, alertas de indisponibilidade e de erros 5xx, orçamento mensal, logs de queries lentas (> 1 s).
- O estado do Terraform (que contém a senha do banco gerada) fica num bucket privado e versionado do próprio projeto.

## Próximos passos possíveis

- **Domínio próprio** (ex.: `obras.suaempresa.com.br`): o mapeamento de domínio do Cloud Run não existe em São Paulo. Opções: um Load Balancer HTTPS global na frente do Cloud Run (~US$ 18/mês, permite também Cloud Armor/WAF) ou mover o serviço para `us-central1`, onde o mapeamento direto é gratuito.
- **Staging**: um segundo projeto com o mesmo Terraform (outro `terraform.tfvars` e `prefix` de estado) e deploy a partir de outra branch.
- **Sem cold start**: `min_instancias = 1` deixa uma instância sempre quente (custo fixo maior).
- **Alta disponibilidade do banco**: `db_alta_disponibilidade = true` (dobra o custo do banco).
- **Rate limit no login**: hoje não há limite de tentativas; o Cloud Armor (com o Load Balancer acima) ou um limitador no app resolvem.
