# Segurança — camadas da plataforma

Mapa de como a plataforma se protege, do usuário à nuvem: o que existe, onde fica no código e o que ainda falta. Para reportar uma falha, veja [`SECURITY.md`](../SECURITY.md). A configuração da nuvem está em [`deploy-gcp.md`](deploy-gcp.md).

## Resumo

| Camada | Proteções | Onde |
|---|---|---|
| Usuários e contas | Senha forte (mín. 10, lista de senhas comuns, sem e-mail/nome), bcrypt custo 12, bloqueio após 5 erros, sessão de 8 h ociosa / 7 dias no máximo, revogação de sessão, página Minha conta com histórico de acessos | `services/senha.ts`, `services/protecao-login.ts`, `lib/auth.ts`, `/conta` |
| Autorização | Papel conferido no servidor em toda action e página; acesso por obra (CAMPO); dados lidos do banco a cada requisição | `lib/auth.ts`, `lib/acao.ts`, `services/acesso.ts` |
| Aplicação web | CSP com nonce, HSTS, anti-clickjacking, COOP/CORP, validação de entrada com limites, erros internos não vão para a tela, redirecionamento só interno | `proxy.ts`, `lib/csp.ts`, `next.config.ts`, `schemas/` |
| Arquivos | Tipo conferido pelo conteúdo (não pelo nome), limite de 8 MB antes de ler o corpo, bucket privado, download com checagem de papel e obra | `api/upload`, `api/fotos`, `services/arquivos.ts` |
| Dados | Banco sem IP liberado e com certificado obrigatório, backups + PITR, segredos no Secret Manager, tokens de convite só com hash | `infra/terraform/database.tf`, `secrets.tf`, `lib/token.ts` |
| Infraestrutura | Uma service account por função, sem chaves; deploy por OIDC só da `main`; container sem root com base fixada por digest | `infra/terraform/iam.tf`, `github_oidc.tf`, `Dockerfile` |
| Cadeia de suprimentos | Actions fixadas por SHA, Dependabot, `npm audit` e verificação de assinaturas do npm no CI, proteção da `main` | `.github/` |
| Detecção e resposta | Log de auditoria do app, eventos de segurança em JSON, métricas e alertas (força bruta, bloqueios, acesso negado, mudança de IAM), log de conexões do banco, auditoria de leitura de segredos, contato de segurança do projeto | `lib/log-seguranca.ts`, `infra/terraform/seguranca.tf` |

## Usuários e contas

- **Senhas** (`services/senha.ts`): mínimo de 10 caracteres e máximo de 72 bytes (o bcrypt ignora o resto). Bloqueia as senhas mais comuns e senhas que repetem o e-mail ou o nome; não exige símbolos (NIST 800-63B). Vale para senhas novas — as atuais continuam até a próxima troca.
- **Hash**: bcrypt custo 12. Hashes antigos (custo 10) são refeitos no próximo login.
- **Força bruta** (`services/protecao-login.ts`): 5 senhas erradas seguidas em 15 minutos bloqueiam o e-mail; 30 falhas em 15 minutos bloqueiam o IP. Vale para e-mails que não existem também, e o login compara a senha mesmo sem conta: nem a mensagem nem o tempo de resposta revelam quais e-mails estão cadastrados. Senha atual errada na troca de senha conta no mesmo limite. O bloqueio fica no banco (`TentativaLogin`), então vale com várias instâncias do Cloud Run.
- **Sessão** (`lib/auth.config.ts`): cookie `HttpOnly`/`Secure`/`SameSite=Lax` com JWT cifrado. Expira após 8 horas sem uso e no máximo 7 dias após o login.
- **Revogação**: cada usuário tem `sessaoVersao`. Trocar a senha (pelo próprio usuário ou pelo admin), desativar a conta ou usar **Encerrar sessões** incrementa a versão e derruba todas as sessões abertas na próxima requisição.
- **Minha conta** (`/conta`): troca de senha (exige a atual), **Sair de todos os aparelhos** e os últimos acessos com IP e resultado — o usuário vê se alguém tentou entrar na conta dele.
- **Administração**: o admin vê o log de atividade de cada pessoa, pode **Encerrar sessões** de qualquer usuário e não consegue deixar o sistema sem um administrador ativo.
- **Convites**: token de 256 bits, banco guarda só o SHA-256, uso único e prazo garantidos numa transação, link montado a partir de `APP_URL` (não do cabeçalho `Host`).

### Boas práticas para os usuários

- Cada pessoa com a própria conta — nada de conta compartilhada no escritório ou no canteiro.
- Use o papel mínimo: CAMPO limitado às obras em que a pessoa trabalha; ADMIN só para quem gerencia acessos.
- Quando alguém sai da empresa ou perde o celular: desative a conta (ou **Encerrar sessões** + troca de senha) no mesmo dia.
- Senha longa e exclusiva (uma frase), guardada num gerenciador de senhas; nunca enviada por WhatsApp. Para cadastrar alguém, prefira **Convidar por link**.
- Revise a cada mês a lista de usuários (tela Usuários mostra "parado há 30+ dias") e desative quem não usa mais.
- Ative a verificação em duas etapas nas contas Google e GitHub que administram a nuvem e o código.

## Aplicação web

- **Autorização no servidor**: toda server action passa por `acaoDeEscrita`/`exigirPapel` e as páginas por `usuarioAtual`; a interface só esconde o que o servidor já bloqueia. CAMPO não vê valores financeiros (nem o peso orçamentário das etapas no cronograma) e, se limitado a obras, as outras somem e dão 404. Mensagens de erro não revelam se um registro de outra obra existe.
- **Content-Security-Policy** (`src/proxy.ts`, `lib/csp.ts`): nonce novo por requisição + `strict-dynamic`; só executam os scripts do próprio Next. Bloqueia plugins, `<base>` trocado, envio de formulário para outro site e o app dentro de iframe de outra origem. Estilos inline são permitidos (gráficos e Gantt usam `style=`). O e2e falha se alguma página registrar violação de CSP (`e2e/fixtures.ts`).
- **Cabeçalhos** (`next.config.ts`): HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (câmera só na própria origem), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`; sem `X-Powered-By`.
- **Entrada**: schemas Zod com tamanho máximo de textos e listas, datas válidas, valores em centavos até R$ 20 milhões (`schemas/comum.ts`). XML de NF-e rejeita `DOCTYPE` (sem XXE nem expansão de entidades). Sem SQL cru: tudo pelo Prisma.
- **Erros**: só mensagens de regra de negócio chegam ao navegador; erros do banco/sistema vão para o log e o usuário vê uma mensagem genérica (`mensagemDeErro` em `lib/acao.ts`).
- **CSRF**: server actions conferem a origem (Next) e o login do Auth.js usa token CSRF.

## Arquivos (fotos e anexos)

- **Upload** (`api/upload`): exige login, recusa pelo `Content-Length` antes de ler o corpo, e o tipo vem da assinatura do conteúdo (JPG, PNG, WEBP, PDF) — um HTML/SVG renomeado para `.jpg` é recusado e o arquivo é gravado com a extensão real. Quem enviou fica registrado (`Arquivo`).
- **Download** (`api/fotos`): ADMIN e ESCRITORIO veem tudo; CAMPO só o que ele mesmo enviou e as fotos de RDO das obras liberadas — anexos de lançamentos e fotos de outras obras dão 404. Cache só no navegador do usuário, por 1 hora.
- **Gravação**: RDO e lançamento só aceitam endereços `/api/fotos/<nome>` gerados pelo app (nada de imagem externa, que serviria de rastreio ou phishing), e foto nova num RDO precisa ter sido enviada pelo próprio usuário.
- **Storage**: bucket privado com bloqueio de acesso público, versionado, sem permissão de exclusão para o app; nomes aleatórios e sem sobrescrita.

## Dados

- PostgreSQL gerenciado sem rede autorizada e com certificado de cliente obrigatório (só pelo Auth Proxy via IAM), proteção contra exclusão, backups diários (14) + PITR de 7 dias, dados em São Paulo.
- Segredos (`DATABASE_URL`, `AUTH_SECRET`) gerados pelo Terraform e guardados no Secret Manager, replicados só no Brasil; leitura dos segredos fica no log de auditoria.
- Certificado A1 da captura Sefaz: enviado pelo Admin na tela Empresa. É conferido (senha, validade, CNPJ da empresa) e guardado no banco cifrado com AES-256-GCM. A chave (`CHAVE_COFRE`) fica no Secret Manager, gerada pelo Terraform, então quem tem só o banco ou um backup não usa o certificado. A senha do `.pfx` não é guardada e vai ao `openssl` por variável de ambiente, não pela linha de comando. O painel mostra titular e validade, nunca a chave. A rota `/api/sefaz/sincronizar` só aceita o token OIDC da service account do agendador (e-mail e audiência conferidos). Tentativa recusada gera o evento `sefaz_gatilho_recusado`.
- Dados pessoais tratados (LGPD): nome, e-mail, IP e horário de acesso dos usuários; CNPJ/CPF e telefone de fornecedores; fotos de obra. Tentativas de login são guardadas por 90 dias. Com `motor_ocr = "vision"` ou Gemini ligado, o documento é processado pelo Google fora do Brasil — registre isso no inventário de tratamento.

## Infraestrutura e entrega

- Service accounts separadas (app, migrations, deploy), cada uma com o mínimo; nenhuma chave criada — o GitHub autentica por OIDC, só deste repositório e da `main`.
- Container sem root, imagem mínima (Next standalone), base fixada por digest, tags imutáveis no Artifact Registry. Opcional: `varredura_imagens = true` liga a varredura de vulnerabilidades de cada imagem.
- CI em todo PR: lint, tipos, testes, migrations num banco vazio, build, e2e (incluindo `e2e/seguranca.spec.ts`), `npm audit` (bloqueia crítica) e `npm audit signatures`. Deploy só depois do CI, com revisão testada antes de receber tráfego.

## Detecção e resposta

**Sinais disponíveis**

- Log de atividade do app (tela Usuários): quem fez o quê, inclusive logins, trocas de senha e encerramento de sessões.
- Eventos de segurança no Cloud Logging (`jsonPayload.categoria="seguranca"`): `login_falhou`, `login_bloqueado`, `sessao_revogada`, `senha_alterada`, `acesso_negado_arquivo`, `upload_recusado`.
- Alertas por e-mail (com `email_alertas`): mais de 30 falhas de login em 10 min, mais de 3 bloqueios em 10 min, mais de 10 acessos negados a arquivos em 10 min, qualquer mudança de IAM ou chave de service account — além de app fora do ar e erros 5xx.
- Banco: conexões/desconexões e queries lentas no log; leitura de segredos no log de auditoria.

**Roteiro de incidente**

1. *Conta suspeita* (acesso não reconhecido, senha vazada): Usuários → pessoa → **Encerrar sessões** e redefinir a senha (ou desativar). Confira o log de atividade da pessoa e os acessos em Logging (`jsonPayload.email`).
2. *Ataque ao login* (alerta de força bruta): veja os IPs em Logging. O bloqueio por e-mail/IP já contém o ataque; se persistir, coloque o Load Balancer + Cloud Armor (abaixo) e bloqueie a origem.
3. *Segredo exposto*: no Cloud Shell, em `infra/terraform` (depois de um `./infra/bootstrap.sh SEU_PROJECT_ID`, que faz o `init`), rode `terraform apply -replace=random_password.auth_secret` para o `AUTH_SECRET` ou `-replace=random_password.db` para a senha do banco — o Terraform gera o valor novo e grava a versão nova no Secret Manager. O Cloud Run lê a versão `latest` ao subir uma revisão: force uma nova com `gcloud run services update gestao-obras --region southamerica-east1 --update-labels=rotacao=$(date +%s)`. Trocar o `AUTH_SECRET` derruba todas as sessões.
4. *Mudança de IAM inesperada*: Logging → `logName:"cloudaudit.googleapis.com%2Factivity"`; reverta rodando o `bootstrap.sh` (o Terraform restaura as permissões descritas no código).
5. *Dados apagados/corrompidos*: restaure o banco num clone (PITR) e as versões antigas do bucket (90 dias) — ver [`deploy-gcp.md`](deploy-gcp.md#backups-e-restauração).
6. Registre o que aconteceu; incidente com dado pessoal pode exigir comunicação à ANPD e aos titulares (LGPD, art. 48).

## O que ainda falta (riscos aceitos e próximos passos)

| Item | Por quê não agora | Como resolver |
|---|---|---|
| Verificação em duas etapas (TOTP) no app | Mudança de fluxo de login para todos; o bloqueio por tentativas + sessões revogáveis cobrem o grosso do risco | Implementar TOTP opcional, depois obrigatório para ADMIN |
| WAF / Cloud Armor e domínio próprio | Precisa de Load Balancer (~US$ 18/mês) | LB HTTPS global + Cloud Armor (regras OWASP e limite por IP); depois `proxy_saltos = 2` e `app_url` |
| Usuário do banco separado para o app (só DML) | O app usa o dono do schema (o mesmo das migrations) | Criar papel `app_rw` sem DDL e usar outro `DATABASE_URL` no serviço |
| Varredura de código (CodeQL) e de segredos no GitHub | Em repositório privado depende do GitHub Advanced Security | Ativar em Settings → Code security, se o plano permitir; ou tornar o repo público |
| Dependabot alerts / security updates | Configuração do repositório, não do código | Settings → Code security → ativar *Dependabot alerts* e *security updates* (o `dependabot.yml` ignora majors só nas atualizações de versão) |
| Vulnerabilidades altas restantes no `npm audit` | `prisma` (CLI, via `deepmerge-ts`) e `@google-cloud/storage` (via `uuid`) só têm correção em versão major; nenhuma recebe entrada de usuário | Migrar Prisma 7 e `@google-cloud/storage` 8 num PR próprio |
| Página 404 global sem nonce | É estática; mostra só o texto, sem scripts | Sem impacto para o usuário |
| Fotos removidas ficam no bucket | O app não tem permissão de apagar (proteção contra ransomware/erro) | Limpeza periódica de órfãos por job dedicado |
| Política de retenção de dados (LGPD) | Decisão do negócio | Definir prazos para RDO, lançamentos, logs de atividade e contas desativadas |
