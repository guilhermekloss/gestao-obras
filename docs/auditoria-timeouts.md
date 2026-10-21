# Auditoria de timeouts e risco de cascata

Out/2026. Escopo: Prisma 6 + PostgreSQL, Next.js 16 (Server Components, Server Actions, Route Handlers) e Auth.js v5.

## Orçamentos de tempo

| Classe | Exemplos | Orçamento | Onde é aplicado |
|---|---|---|---|
| Rápida | `usuarioAtual()`, login (`authorize`), leituras simples, mutações de formulário, upload | ≤ 5 s | `pool_timeout=5` e `connect_timeout=5` na `DATABASE_URL`; transações com `maxWait` 2 s / `timeout` 5 s; `lock_timeout` 5 s; GCS 10 s por requisição, 15 s no total |
| Analítica | Dashboard, Curva S, Curva ABC, alertas | ≤ 15 s | `statement_timeout` 15 s no usuário do banco; Curva S do dashboard em `<Suspense>` próprio e com fallback de erro |
| Leitura de documento | OCR Cloud Vision, Gemini | 60–120 s | Vision 30 s × 2 tentativas; Gemini `AbortSignal.timeout(120 s)` |
| Job | Captura Sefaz (`/api/sefaz/*`) | 300 s | `maxDuration = 300`, 25 s por chamada × 8 lotes |
| Navegador | `fetch("/api/upload")` | 60 s | `AbortSignal.timeout` em `src/lib/envio.ts` |

## Achados e o que foi feito

| # | Severidade | Onde | Achado | Correção |
|---|---|---|---|---|
| 1 | Alta | `infra/terraform/secrets.tf` | Pool de 5 conexões com `pool_timeout=20` e **nenhum `statement_timeout`**. Uma query presa segura a conexão sem limite; com o pool cheio, toda página (`usuarioAtual()`) e o login esperam até 20 s na fila. É a cascata. | `pool_timeout=5&connect_timeout=5`; migração `20261021120000_timeouts_sessao` com `statement_timeout` 15 s, `lock_timeout` 5 s e `idle_in_transaction_session_timeout` 15 s para o usuário do app. |
| 2 | Alta | `dashboard/page.tsx`, `services/custos.ts` (`notasParaAnalise`), `dashboard/widgets/curva-s.tsx` | O dashboard dispara ~9 queries em paralelo num pool de 5. `notasParaAnalise` lê todas as notas com itens e rateios, sem limite, e cresce com o histórico. A Curva S não tinha `Suspense` próprio e, se falhasse, levava a página inteira para `(app)/error.tsx`. | A Curva S agora fica num `<Suspense>` próprio, com esqueleto, e mostra "não foi possível carregar" em vez de derrubar o dashboard. A query fica limitada pelos 15 s do item 1. |
| 3 | Alta | `src/lib/storage.ts` | `new Storage()` usava o padrão da lib, que repete as tentativas por até 600 s. Isso afeta rotas rápidas: `/api/upload`, `/api/fotos/[nome]` e a leitura de nota. | `retryOptions: { totalTimeout: 15, maxRetries: 2 }` e `timeout` de 10 s por requisição HTTP. |
| 4 | Média | `leitor-nativo/extracao/vision.ts` | 60 s × 3 tentativas ≈ 180 s. Somado ao Gemini (120 s), passa do limite de 300 s do Cloud Run, e a tela fica em "processando" até cair. | 30 s × 2 tentativas (≈ 60 s). |
| 5 | Média | `notas/nota-form.tsx`, `notas/nova/novo-lancamento.tsx`, `diario/novo/rdo-form.tsx` | `fetch("/api/upload")` sem prazo: com a conexão travada, o estado "enviando" nunca termina. | `enviarArquivo()` em `src/lib/envio.ts`, com `AbortSignal.timeout(60 s)` e mensagem própria para `TimeoutError`. O `finally` existente libera o estado. |
| 6 | Baixa | `src/lib/prisma.ts` | Nenhuma transação interativa passa `{ maxWait, timeout }`, mas o Prisma 6 aplica 2 s / 5 s por padrão, então **não estão ilimitadas**. Todas fazem só DML curto (bcrypt e leituras de arquivo ficam fora). | Os padrões passaram a ser explícitos em `transactionOptions` no `PrismaClient`. Nenhuma transação foi mudada. |

### Sem problema

- **`src/proxy.ts` e os callbacks `jwt`/`session` (`auth.config.ts`):** não fazem I/O, só decodificam e montam o JWT. Não travam o middleware.
- **`authorize` e `usuarioAtual` (`lib/auth.ts`):** só fazem acesso ao banco e agora ficam limitados pelo item 1 (fila ≤ 5 s, query ≤ 15 s, transação ≤ 5 s).
- **`fetch` no servidor:** não há `fetch` nativo em Server Components, Server Actions ou Route Handlers. As integrações externas usam SDKs:
  - Gemini (`leitor-gemini.ts`, `assistente/ia.ts`) já usa `AbortSignal.timeout` e trata `TimeoutError`/`AbortError`.
  - Sefaz (`sefaz/cliente.ts`) usa o `timeout` do `https.request`, que é de ociosidade do socket e não total. Isso é aceitável com `MAX_BYTES_RESPOSTA` e `maxDuration = 300`.
  - O `verifyIdToken` do agendador guarda as chaves públicas em cache.
- **Formulários com `react-hook-form`:** o salvamento (`salvarNota`, login) só acessa o banco. O estado pendente fica limitado pelos prazos acima.

## Próximos passos (fora deste ajuste)

- **`notasParaAnalise`:** trocar a leitura completa de notas, itens e rateios por agregação no SQL (`groupBy`, ou SQL com `SUM` por obra/etapa/mês) ou por um resumo materializado. É o ponto que mais cresce com o uso, e hoje os KPIs, os alertas e a Curva ABC do dashboard dependem dele. Quando passar dos 15 s, o dashboard inteiro vai para a tela de erro.
- **Limpeza de `tentativaLogin` e `registrarAtividade` no login:** passar para `after()` (`next/server`), para não somar ao tempo de resposta do `authorize`.
- **`/api/health`:** hoje é só liveness. Se for usado como readiness, incluir um `SELECT 1` com prazo curto.

## Como verificar

```sql
-- conexão nova com o usuário do app
SHOW statement_timeout;            -- 15s
SELECT pg_sleep(16);               -- ERROR: canceling statement due to statement timeout
```

Uma migração demorada deve começar com `SET statement_timeout = 0;`, porque o job de migração usa o mesmo usuário.
