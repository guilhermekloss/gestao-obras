# Proteção ativa contra abuso (modelo Fail2ban)

Mapa das capacidades de um Fail2ban — ler os registros, reconhecer padrões de ataque, punir a origem por um tempo e avisar alguém — traduzidas para esta plataforma. Mostra o que já existe, o que falta e em que ordem implementar. Complementa [`seguranca.md`](seguranca.md).

> O Fail2ban trabalha no servidor: lê `/var/log/*`, aplica regex e bane o IP no firewall. Aqui o app roda no Cloud Run, sem firewall de máquina e com várias instâncias. O mesmo modelo vale, mas o "log" é o banco (para decidir na hora) e o Cloud Logging (para alertar), e o "firewall" é o próprio app ou o Cloud Armor.

## 1. Conceitos do Fail2ban e equivalentes aqui

| Fail2ban | O que faz | Equivalente na plataforma | Situação |
|---|---|---|---|
| `logpath` / `backend` | Fonte dos eventos | `TentativaLogin` (banco) e `eventoSeguranca()` em JSON no Cloud Logging (`lib/log-seguranca.ts`) | Parcial: só o login grava no banco; os outros eventos só vão para o log, que o app não consulta |
| `filter` / `failregex` | Reconhece uma falha numa linha de log | Tipos de `EventoSeguranca` (`login_falhou`, `acesso_negado_arquivo`, `upload_recusado`, `sefaz_gatilho_recusado`...) | Parcial: os eventos existem, mas só o login vira decisão |
| `jail` | Liga um filtro a uma regra e a uma ação | Regra do login em `services/protecao-login.ts` | Só uma "jail" (login, por e-mail e por IP) |
| `maxretry` / `findtime` | N falhas dentro da janela | 5 por e-mail e 30 por IP em 15 min | Existe para o login |
| `bantime` | Duração do banimento | Tabela `Bloqueio` com o prazo (`ate`); o primeiro dura 15 min | Existe |
| `bantime.increment` | Banimento cresce a cada reincidência | `duracaoDoBloqueio`: IP 15 min → 1 h → 6 h → 24 h; e-mail 15 → 30 → 60 min (reincidência em 24 h) | Existe no login |
| `recidive` | Jail que bane por muito tempo quem foi banido várias vezes (por qualquer jail) | — | Falta |
| `ignoreip` | Lista de IPs que nunca são banidos | `IPS_CONFIAVEIS` (IP ou CIDR, IPv4/IPv6), só para a regra por IP | Existe |
| `action` (iptables, nftables) | Bloqueia a origem | Login recusado com `LoginBloqueado` | Só no login; nenhuma outra rota bloqueia por IP |
| `action` (sendmail) | Avisa por e-mail | Alertas do Cloud Monitoring (`infra/terraform/seguranca.tf`) | Existe para a equipe técnica; o usuário afetado e o admin do app não são avisados |
| `dbfile` | Banimentos sobrevivem a reinício | Bloqueio calculado do banco: vale com várias instâncias | Existe para o login; o limite do assistente é em memória, por instância |
| `dbpurgeage` | Limpa histórico antigo | Tentativas apagadas após 90 dias | Existe |
| `fail2ban-client status/banip/unbanip` | Ver, banir e desbanir à mão | **Usuários → Bloqueios**: lista e **Liberar agora** | Existe (sem banir à mão) |
| `fail2ban-regex` | Testa filtros contra um log | Testes unitários das funções puras (`protecao-login.test.ts`, `-limites.test.ts`) | Existe; manter o padrão nas regras novas |

## 2. Superfícies que pedem uma "jail"

Cada linha é uma regra (filtro + limite + ação). As de login já existem; as demais são propostas.

| Jail | Sinal (filtro) | Chave | Limite sugerido | Ação | Situação |
|---|---|---|---|---|---|
| `login-email` | senha errada / conta inexistente / inativa | e-mail | 5 em 15 min | recusa login até liberar | Existe |
| `login-ip` | qualquer falha de login | IP | 30 em 15 min | recusa login até liberar | Existe |
| `troca-senha` | senha atual errada em `/conta` | e-mail | soma no `login-email` | idem | Existe |
| `convite` | token inexistente, vencido ou já usado em `/convite/[token]` | IP | 10 em 15 min | 429 nas páginas de convite | Falta (o token tem 256 bits, então não é adivinhável; a regra corta varredura e ruído) |
| `varredura` | 404 em caminhos de robô (`/.env`, `/wp-login.php`, `/.git/`, `/phpmyadmin`, `*.php`) | IP | 3 em 10 min | 403 em todo o app por 1 h | Falta |
| `arquivos` | `acesso_negado_arquivo` | usuário | 20 em 10 min | encerra a sessão, avisa o admin | Só alerta hoje (limite 10 no Monitoring) |
| `upload` | `upload_recusado` (tipo falso, tamanho) | usuário | 10 em 10 min | recusa novos uploads por 30 min | Só log hoje |
| `assistente` / `leitura-ia` | perguntas ao assistente e leituras de nota pelo Gemini | usuário | 20 em 10 min (assistente), definir para leitura | recusa com mensagem | Assistente em memória por instância; leitura sem limite. Pesa no custo, não só na segurança |
| `sefaz` | `sefaz_gatilho_recusado` | IP | 5 em 1 h | 403 na rota | Só log hoje |
| `recidive` | banimentos de qualquer jail | IP e e-mail | 3 banimentos em 24 h | banimento de 24 h, e-mail ao admin | Falta |

## 3. Riscos específicos desta plataforma

- **IP compartilhado**: o escritório sai por um IP e o pessoal de campo usa 4G, onde as operadoras brasileiras colocam muita gente atrás do mesmo IP (CGNAT). Banir IP com limite baixo derruba gente honesta. Por isso: limites por IP folgados, banimento por IP longo só para sinais inequívocos (`varredura`, `recidive`) e `ignoreip` para o IP fixo do escritório.
- **Bloqueio como arma**: o bloqueio por e-mail deixa um atacante trancar a conta de alguém só errando a senha cinco vezes. O Fail2ban bane o atacante; aqui o bloqueio cai na vítima. Saída recomendada pela OWASP: *cookie de dispositivo conhecido* — depois de um login certo, o navegador recebe um cookie assinado e, enquanto ele valer, as falhas de outros lugares não bloqueiam esse navegador (o limite próprio dele continua).
- **IP forjado**: o IP vem de `ipDoCliente()` com `PROXY_SALTOS`, que já ignora o que o cliente põe à frente do `X-Forwarded-For`. Ao colocar o Load Balancer, mudar para `proxy_saltos = 2`, senão todos aparecem com o IP do LB e o primeiro banimento derruba o sistema inteiro.
- **Custo por requisição**: consultar o banco em toda requisição no `proxy.ts` pesa. Checar a lista de banidos só nas rotas sensíveis (login, convite, upload, IA, Sefaz) e, para a `varredura`, usar cache em memória de 30–60 s por instância.
- **`proxy.ts` não cobre `/api`**: o `matcher` exclui `api`. Regras para `/api/upload`, `/api/fotos` e `/api/sefaz` precisam ser aplicadas nas próprias rotas.

## 4. Proposta de implementação

### 4.1 Modelo de dados

Duas tabelas no lugar de uma por jail (a `Bloqueio` entrou na fase 1, com `liberadoPorId` ligado ao usuário; a `Infracao` vem na fase 2):

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

Funções puras, no mesmo estilo de `situacaoLogin`, testáveis sem banco:

- `REGRAS`: tabela com `{ maxFalhas, janelaMs, banimentoMs, chave: "ip" | "email" | "usuario" }` por jail.
- `avaliar(regra, falhas, agora)` → `{ bloquear: false } | { bloquear: true, ate }`.
- `duracaoProgressiva(base, bloqueiosAnteriores)` → `bantime.increment`: 15 min, 1 h, 6 h, 24 h (teto).
- `reincidente(bloqueios, agora)` → `recidive`: 3 bloqueios da mesma chave em 24 h viram 24 h.
- `ignorado(ip, listaCidr)` → `ignoreip` a partir de `IPS_CONFIAVEIS` (CIDR separados por vírgula). Vale só para regras por IP: o limite por e-mail continua.

E uma camada fina com banco (`lib/protecao.ts`):

- `registrarInfracao(regra, chave, detalhe)` grava a `Infracao`, avalia e, se for o caso, cria o `Bloqueio` e emite `eventoSeguranca("bloqueio_aplicado", ...)`.
- `estaBloqueado(chaves[])` consulta `Bloqueio` com `ate > agora` e `liberadoEm` nulo.

### 4.3 Ações em níveis

Do mais leve ao mais forte, como as `action` do Fail2ban:

1. **Registrar** — só `eventoSeguranca` (o que existe hoje para a maioria dos sinais).
2. **Frear** — HTTP 429 com `Retry-After`, ou atraso crescente na resposta do login.
3. **Bloquear** — 403 genérico nas rotas sensíveis enquanto o `Bloqueio` valer.
4. **Encerrar sessão** — incrementar `sessaoVersao` do usuário (mecanismo que já existe) quando a regra é por usuário (`arquivos`).
5. **Avisar** — e-mail ao usuário ("sua conta foi bloqueada por tentativas; se não foi você, troque a senha") e ao admin nas reincidências. O app ainda não envia e-mail: exige um provedor (SMTP ou API) e o segredo dele no Secret Manager; até lá, o aviso fica na tela **Minha conta** e no alerta do Monitoring.
6. **Bloquear na borda** — com Cloud Armor, exportar os IPs de `recidive` e `varredura` para uma regra de negação (job agendado ou regra por limite de taxa do próprio Cloud Armor).

### 4.4 Tela de administração ("fail2ban-client")

Nova aba em **Usuários** ou página **Segurança** (só ADMIN):

- Bloqueios ativos: regra, chave (e-mail ou IP), motivo, até quando.
- **Liberar agora** (grava `liberadoEm`/`liberadoPor` e, no login, apaga as falhas do e-mail) e **Bloquear IP** manual com prazo.
- Últimas infrações por regra, para ver se é ataque ou alguém esquecendo a senha.
- Toda ação vai para o log de atividade (`registrarAtividade`, ex.: `seguranca.liberar`).

Feito na fase 1 para o login (aba **Bloqueios**, ação `liberarBloqueio`); falta o **Bloquear IP** manual.

### 4.5 Observabilidade

- Novos eventos em `EventoSeguranca`: `bloqueio_aplicado`, `bloqueio_liberado`, `varredura_detectada`, `convite_invalido`, `limite_excedido`. Atualizar a descrição do rótulo `evento` em `seguranca.tf`.
- Novo alerta: qualquer `bloqueio_aplicado` com `regra="recidive"`; mais de 5 `varredura_detectada` em 10 min.
- Em **Minha conta**, mostrar "sua conta foi bloqueada em DD/MM às HH:MM a partir do IP X" junto do histórico de acessos que já existe.

## 5. Ordem sugerida

| Fase | Entrega | Por quê primeiro |
|---|---|---|
| 1 ✅ | Tela de bloqueios com **Liberar agora** para o login + `ignoreip` + `bantime.increment` no login | Resolve o suporte do dia a dia e endurece o ponto mais atacado |
| 2 | Tabela `Infracao` (a `Bloqueio` já existe), motor de regras e jails `convite`, `upload`, `sefaz`, limite da IA no banco (troca o limitador em memória) | Generaliza o modelo e fecha o risco aceito do assistente por instância |
| 3 | `recidive`, jail `varredura` no `proxy.ts` com cache, encerrar sessão na jail `arquivos` | Pede cuidado com IP compartilhado; vem depois de ter a tela para desfazer erro |
| 4 | Cookie de dispositivo conhecido no login e e-mail ao usuário bloqueado | Tira o bloqueio de conta das mãos do atacante |
| 5 | Load Balancer + Cloud Armor (`proxy_saltos = 2`), exportando `recidive` para a borda | Custo mensal; já previsto em `seguranca.md` |

Cada fase com testes unitários das funções puras (incluindo os arquivos `-limites.test.ts` para as bordas: exatamente N falhas, falha no instante do fim da janela, IP na borda do CIDR) e um cenário em `e2e/seguranca.spec.ts`.
