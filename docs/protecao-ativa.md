# Proteção ativa contra abuso (modelo Fail2ban)

Mapa das capacidades de um Fail2ban — ler os registros, reconhecer padrões de ataque, punir a origem por um tempo e avisar alguém — traduzidas para esta plataforma. Mostra o que já existe, o que falta e em que ordem implementar. Complementa [`seguranca.md`](seguranca.md).

> O Fail2ban trabalha no servidor: lê `/var/log/*`, aplica regex e bane o IP no firewall. Aqui o app roda no Cloud Run, sem firewall de máquina e com várias instâncias. O mesmo modelo vale, mas o "log" é o banco (para decidir na hora) e o Cloud Logging (para alertar), e o "firewall" é o próprio app ou o Cloud Armor.

## 1. Conceitos do Fail2ban e equivalentes aqui

| Fail2ban | O que faz | Equivalente na plataforma | Situação |
|---|---|---|---|
| `logpath` / `backend` | Fonte dos eventos | `TentativaLogin` (banco) e `eventoSeguranca()` em JSON no Cloud Logging (`lib/log-seguranca.ts`) | Parcial: só o login grava no banco; os outros eventos só vão para o log, que o app não consulta |
| `filter` / `failregex` | Reconhece uma falha numa linha de log | Ponto do código que chama `registrarInfracao` (link de convite inexistente, arquivo de formato falso, gatilho da Sefaz sem token) | Existe para login, convite, upload e Sefaz; `acesso_negado_arquivo` ainda só vai para o log |
| `jail` | Liga um filtro a uma regra e a uma ação | Login em `services/protecao-login.ts`; demais em `REGRAS` de `services/protecao-ativa.ts` | Login, convite, upload, Sefaz, assistente e leitura de notas |
| `maxretry` / `findtime` | N falhas dentro da janela | 5 por e-mail e 30 por IP em 15 min | Existe para o login |
| `bantime` | Duração do banimento | Tabela `Bloqueio` com o prazo (`ate`); o primeiro dura 15 min | Existe |
| `bantime.increment` | Banimento cresce a cada reincidência | `duracaoDoBloqueio`: IP 15 min → 1 h → 6 h → 24 h; e-mail 15 → 30 → 60 min (reincidência em 24 h) | Existe no login |
| `recidive` | Jail que bane por muito tempo quem foi banido várias vezes (por qualquer jail) | Regra `recidiva`: 3 bloqueios do mesmo IP em 24 h tiram o IP do site por 24 h (7 dias se repetir) | Existe, só para IP |
| `ignoreip` | Lista de IPs que nunca são banidos | `IPS_CONFIAVEIS` (IP ou CIDR, IPv4/IPv6), só para a regra por IP | Existe |
| `action` (iptables, nftables) | Bloqueia a origem | Login recusado com `LoginBloqueado` | Só no login; nenhuma outra rota bloqueia por IP |
| `action` (sendmail) | Avisa por e-mail | Alertas do Cloud Monitoring (`infra/terraform/seguranca.tf`) | Existe para a equipe técnica; o usuário afetado e o admin do app não são avisados |
| `dbfile` | Banimentos sobrevivem a reinício | Tabelas `Infracao` e `Bloqueio`: valem com várias instâncias | Existe para todas as regras (o limitador em memória do assistente saiu) |
| `dbpurgeage` | Limpa histórico antigo | `limparRegistrosDeProtecao`: infrações após 7 dias, tentativas e bloqueios após 90 | Existe |
| `fail2ban-client status/banip/unbanip` | Ver, banir e desbanir à mão | **Usuários → Bloqueios**: lista, **Liberar agora** e **Bloquear IP** | Existe |
| `fail2ban-regex` | Testa filtros contra um log | Testes unitários das funções puras (`protecao-login.test.ts`, `-limites.test.ts`) | Existe; manter o padrão nas regras novas |

## 2. Superfícies que pedem uma "jail"

Cada linha é uma regra (filtro + limite + ação). As de login já existem; as demais são propostas.

| Jail | Sinal (filtro) | Chave | Limite sugerido | Ação | Situação |
|---|---|---|---|---|---|
| `login-email` | senha errada / conta inexistente / inativa | e-mail | 5 em 15 min | recusa login até liberar | Existe |
| `login-ip` | qualquer falha de login | IP | 30 em 15 min | recusa login até liberar | Existe |
| `troca-senha` | senha atual errada em `/conta` | e-mail | soma no `login-email` | idem | Existe |
| `convite` | token inexistente em `/convite/[token]` (vencido ou já usado não conta: é link velho, não varredura) | IP | 10 em 15 min | página e cadastro recusam, 15 min → 24 h na reincidência | Existe (o token tem 256 bits, então não é adivinhável; a regra corta varredura e ruído) |
| `varredura` | caminhos de robô (`/.env`, `/wp-login.php`, `/.git/`, `/phpmyadmin`, `*.php`, `*.sql`), conferidos no `proxy.ts` | IP | 3 em 10 min | 403 em todo o app (páginas e `/api/auth`) por 1 h → 24 h | Existe |
| `arquivos` | `acesso_negado_arquivo` | usuário | 20 em 10 min | encerra a sessão e recusa arquivos por 30 min → 24 h; o alerta do Monitoring (10 em 10 min) avisa antes | Existe |
| `upload` | `upload_recusado` (conteúdo não é JPG/PNG/WEBP/PDF) | usuário | 10 em 10 min | 429 com `Retry-After`, 30 min → 6 h | Existe |
| `assistente` / `leitura` | perguntas ao assistente; leitura de nota (OCR nativo e Gemini) | usuário | 20 em 10 min (assistente), 30 em 10 min (leitura) | recusa com mensagem por 10 min, sem crescer | Existe, no banco. Pesa no custo, não só na segurança |
| `sefaz` | `sefaz_gatilho_recusado` | IP | 5 em 1 h | 429 antes de verificar o token, 1 h → 24 h | Existe |
| `recidiva` | bloqueios de qualquer regra por IP (login-ip, convite, Sefaz, varredura) | IP | 3 bloqueios em 24 h | 403 em todo o app por 24 h → 7 dias | Existe. Não vale para e-mail nem usuário: tirar a conta da vítima do ar seria fazer o trabalho do atacante |

## 3. Riscos específicos desta plataforma

- **IP compartilhado**: o escritório sai por um IP e o pessoal de campo usa 4G, onde as operadoras brasileiras colocam muita gente atrás do mesmo IP (CGNAT). Banir IP com limite baixo derruba gente honesta. Por isso: limites por IP folgados, banimento por IP longo só para sinais inequívocos (`varredura`, `recidive`) e `ignoreip` para o IP fixo do escritório.
- **Bloqueio como arma**: o bloqueio por e-mail deixa um atacante trancar a conta de alguém só errando a senha cinco vezes. O Fail2ban bane o atacante; aqui o bloqueio cai na vítima. Saída recomendada pela OWASP: *cookie de dispositivo conhecido* — depois de um login certo, o navegador recebe um cookie assinado e, enquanto ele valer, as falhas de outros lugares não bloqueiam esse navegador (o limite próprio dele continua). **Feito (fase 4)**: `services/dispositivo.ts` e `lib/dispositivo.ts`. O cookie `dispositivo-<hash>` vale 90 dias, é assinado com chave derivada do `AUTH_SECRET` (trocar o segredo invalida todos) e só leva um hash curto do e-mail. Do aparelho conhecido, 5 erros bloqueiam só aquele aparelho (`login-dispositivo`); de aparelho desconhecido, os erros contam no e-mail como antes.
- **IP forjado**: o IP vem de `ipDoCliente()` com `PROXY_SALTOS`, que já ignora o que o cliente põe à frente do `X-Forwarded-For`. Ao colocar o Load Balancer, mudar para `proxy_saltos = 2`, senão todos aparecem com o IP do LB e o primeiro banimento derruba o sistema inteiro.
- **Custo por requisição**: o `proxy.ts` confere se o IP está fora do site (varredura, recidiva, manual) com cache de 30 s por instância; um bloqueio criado em outra instância, ou uma liberação, leva até 30 s para valer em todas. Se o banco falhar, o proxy deixa passar (registra o erro) em vez de derrubar o site.
- **Corpo das requisições**: o proxy do Next guarda o corpo da requisição na memória. Por isso o `/api` continua fora dele, menos o `/api/auth` (login direto do Auth.js, corpo pequeno): o upload segue recusando pelo tamanho antes de ler o corpo.
- **`proxy.ts` não cobre `/api`**: o `matcher` exclui `api`. Regras para `/api/upload`, `/api/fotos` e `/api/sefaz` precisam ser aplicadas nas próprias rotas.

## 4. Proposta de implementação

### 4.1 Modelo de dados

Duas tabelas no lugar de uma por jail (a `Bloqueio` entrou na fase 1, a `Infracao` na fase 2). Esboço; o modelo final está em `prisma/schema.prisma` (sem `detalhe` na `Infracao`: o que precisa de contexto vai para o evento de segurança, e `Bloqueio` tem `liberadoPorId` ligado ao usuário):

```prisma
/// Falha que conta para uma regra de bloqueio (o "log" que a regra lê).
model Infracao {
  id       String   @id @default(cuid())
  regra    String   // "convite", "varredura", "upload", ...
  chave    String   // IP, e-mail ou usuarioId, conforme a regra
  detalhe  String?  // caminho, motivo; nunca senha ou token
  criadoEm DateTime @default(now())

  @@index([regra, chave, criadoEm])
  @@index([criadoEm])
}

/// Banimento ativo ou passado (fonte da tela de administração e da reincidência).
model Bloqueio {
  id          String    @id @default(cuid())
  regra       String
  chave       String
  ate         DateTime
  motivo      String
  manual      Boolean   @default(false)
  liberadoEm  DateTime?
  liberadoPor String?   // usuarioId do admin
  criadoEm    DateTime  @default(now())

  @@index([chave, ate])
  @@index([criadoEm])
}
```

`TentativaLogin` continua como está (já tem o sucesso, que a regra de login usa para zerar as falhas).

### 4.2 Motor de regras (`services/protecao-ativa.ts`)

Funções puras, testáveis sem banco (implementadas):

- `REGRAS`: por regra, `{ chave: "ip" | "usuario", tipo: "falha" | "uso", max, janelaMs, duracoesMs, motivo, mensagem }`.
- `limiteDaRegraAtingido(regra, ocorrencias, agora, desde)`: N ocorrências na janela, contando só as posteriores ao último bloqueio da mesma regra e chave (o que já rendeu bloqueio ou foi liberado não conta de novo).
- `duracaoDaRegra(regra, anteriores)` e, no login, `duracaoDoBloqueio`: `bantime.increment` com teto.
- `faixasDeIp` / `ipConfiavel` (em `protecao-login.ts`): `ignoreip` a partir de `IPS_CONFIAVEIS`.
- `contaParaRecidiva(regra)` e `caminhoDeVarredura(caminho)`; a recidiva usa a mesma `limiteDaRegraAtingido`, contando bloqueios em vez de infrações (`lib/protecao.ts`, `aplicarBloqueio`).

Camada com banco (`lib/protecao.ts`):

- `registrarInfracao(regra, chave)` grava a `Infracao`, avalia e, se for o caso, cria o `Bloqueio` com o prazo da reincidência e emite `bloqueio_aplicado`.
- `bloqueioAtivo(regras, chaves)` consulta `Bloqueio` com `ate > agora` e `liberadoEm` nulo, só nas regras pedidas (um IP barrado no convite continua podendo fazer login).
- `consumirLimite(regra, chave)` para limites de uso: recusa se bloqueado, senão conta o uso.
- `ipVigiado(ip)`: devolve o IP só se ele não for confiável; sem IP (desenvolvimento local), as regras por IP não se aplicam.

### 4.3 Ações em níveis

Do mais leve ao mais forte, como as `action` do Fail2ban:

1. **Registrar** — só `eventoSeguranca` (o que existe hoje para a maioria dos sinais).
2. **Frear** — HTTP 429 com `Retry-After`, ou atraso crescente na resposta do login.
3. **Bloquear** — 403 genérico nas rotas sensíveis enquanto o `Bloqueio` valer.
4. **Encerrar sessão** — incrementar `sessaoVersao` do usuário (mecanismo que já existe) quando a regra é por usuário (`arquivos`).
5. **Avisar** — feito no app: depois de um bloqueio do e-mail, a pessoa vê no próximo acesso a faixa "Sua conta foi bloqueada por senha errada em …", com **Trocar senha** e **Fui eu** (trocar a senha também marca como visto). O e-mail continua pendente: o app não tem provedor de envio (SMTP ou API) nem o segredo dele no Secret Manager. A equipe técnica segue avisada pelos alertas do Monitoring.
6. **Bloquear na borda** — com Cloud Armor, exportar os IPs de `recidive` e `varredura` para uma regra de negação (job agendado ou regra por limite de taxa do próprio Cloud Armor).

### 4.4 Tela de administração ("fail2ban-client")

Nova aba em **Usuários** ou página **Segurança** (só ADMIN):

- Bloqueios ativos: regra, chave (e-mail ou IP), motivo, até quando.
- **Liberar agora** (grava `liberadoEm`/`liberadoPor` e, no login, apaga as falhas do e-mail) e **Bloquear IP** manual com prazo.
- Últimas infrações por regra, para ver se é ataque ou alguém esquecendo a senha.
- Toda ação vai para o log de atividade (`registrarAtividade`, ex.: `seguranca.liberar`).

Feito: aba **Bloqueios** com `liberarBloqueio` e `bloquearIp` (1 hora, 24 horas ou 7 dias; recusa o IP de quem está bloqueando e os IPs confiáveis).

### 4.5 Observabilidade

- Eventos `bloqueio_aplicado` (com `regra`, inclusive `varredura` e `recidiva`), `bloqueio_liberado` e `convite_invalido`; a sessão derrubada pela regra `arquivos` sai como `sessao_revogada` com `motivo`.
- Sem alerta próprio para varredura: na internet aberta ela é ruído constante, e o bloqueio já resolve. Se quiser ser avisado de reincidência, filtre `jsonPayload.evento="bloqueio_aplicado" AND jsonPayload.regra="recidiva"` no Logging.
- Em **Minha conta**, mostrar "sua conta foi bloqueada em DD/MM às HH:MM a partir do IP X" junto do histórico de acessos que já existe.

## 5. Ordem sugerida

| Fase | Entrega | Por quê primeiro |
|---|---|---|
| 1 ✅ | Tela de bloqueios com **Liberar agora** para o login + `ignoreip` + `bantime.increment` no login | Resolve o suporte do dia a dia e endurece o ponto mais atacado |
| 2 ✅ | Tabela `Infracao`, motor de regras e jails `convite`, `upload`, `sefaz`, limites do assistente e da leitura de notas no banco (troca o limitador em memória) | Generaliza o modelo e fecha o risco aceito do assistente por instância |
| 3 ✅ | `recidiva`, jail `varredura` no `proxy.ts` com cache, encerrar sessão na jail `arquivos`, **Bloquear IP** manual | Pede cuidado com IP compartilhado; vem depois de ter a tela para desfazer erro |
| 4 ✅ | Cookie de aparelho conhecido no login e aviso ao usuário bloqueado (no app; e-mail fica para quando houver provedor) | Tira o bloqueio de conta das mãos do atacante |
| 5 | Load Balancer + Cloud Armor (`proxy_saltos = 2`), exportando `recidive` para a borda | Custo mensal; já previsto em `seguranca.md` |

Cada fase com testes unitários das funções puras (incluindo os arquivos `-limites.test.ts` para as bordas: exatamente N falhas, falha no instante do fim da janela, IP na borda do CIDR) e um cenário em `e2e/seguranca.spec.ts`.
