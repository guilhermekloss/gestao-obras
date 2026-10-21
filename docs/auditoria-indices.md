# Auditoria de índices (regra ESR)

Out/2026. Escopo: todas as chamadas Prisma de `src/` (Server Components, Server Actions, Route Handlers, `services/` e `lib/auth.ts`) cruzadas com `prisma/schema.prisma`. Não há `$queryRaw`. O sistema atende uma empresa só, então não existe `tenantId`. As chaves de igualdade reais são `status`, `obraId`, `fornecedorId`, `etapaId`, `cnpj`, `usuarioId` e `email`.

**Regra ESR:** num índice composto, primeiro as colunas de **igualdade** (`=`), depois a de **ordenação** (`orderBy`) e por último a de **intervalo** (`gt`, `gte`, `lt`, `lte`). Um índice `[A, B]` também atende `WHERE A = x`, por ser o prefixo à esquerda, mas não atende `WHERE B = y` sozinho. Por isso um `@@index([A])` ao lado de `[A, B]`, ou ao lado de um `@@unique([A, B])`, é redundante.

## Achados e o que foi feito

Migração: `20261021200000_indices_esr`.

| # | Model | Antes | Depois | Query que justifica |
|---|---|---|---|---|
| 1 | Parcela | `[vencimento, status]` (**invertido**) | `[status, vencimento]` | `status = 'ABERTA' AND vencimento <= / <`, `ORDER BY vencimento`: `contas/page.tsx` (visões padrão, semana, mês e vencidas), `dashboard/page.tsx` (próximos 7 dias), `carregarAlertas` (vencidas) e `obras/[id]/abas/resumo.tsx`. A visão "pagas" e o fluxo mensal usam o prefixo `status`. |
| 2 | Parcela | `[notaId]` | removido | Coberto por `@@unique([notaId, numero])`. |
| 3 | NotaFiscal | `[fornecedorId]` | `[fornecedorId, dataCompra]` | `notas/(lista)`: `fornecedorId = X AND dataCompra BETWEEN ... ORDER BY dataCompra DESC`. `fornecedores/[id]`: notas do fornecedor por data. O índice antigo era redundante com `@@unique([fornecedorId, numero])`. `[dataCompra]` fica para a lista sem filtro. |
| 4 | DiarioObra | `[obraId, data]` | removido | Cópia exata do índice de `@@unique([obraId, data])`, que já atende a lista por obra (`ORDER BY data DESC`, varredura reversa), o `count` e o `groupBy`. |
| 5 | DocumentoSefaz | `[status, situacao]` | `[status, situacao, dataEmissao(sort: Desc)]` | `listarRecebidas`: `status = 'NOVA' AND situacao IN (...) ORDER BY situacao ASC, dataEmissao DESC`. A direção é mista, então o `Desc` é necessário: sem ele o índice não entrega a ordem e o Postgres ordena. Os `count` por `status`/`situacao` usam o prefixo. |
| 6 | DocumentoSefaz | nenhum | `[recebidoEm]` | `carregarPainel`: `count` das recebidas em 24 h e em 7 dias (só intervalo), numa tabela que só cresce. |
| 7 | Foto | nenhum em `diarioId` (FK) | `[diarioId]` | `include: { fotos }` e `_count.fotos` em toda lista de RDO, e o `ON DELETE CASCADE` ao excluir um RDO, que antes varria a tabela inteira. |
| 8 | Medicao | `[etapaId]` | `[etapaId, data]` | `etapaId = X` (validação da série em `cronograma/actions.ts`) e as leituras por `data`. Troca sem custo extra de escrita. |
| 9 | Etapa | nenhum em `obraId` (FK) | `[obraId, ordem]` | `where: { obraId }, orderBy: { ordem: 'asc' }` em resumo, cronograma, orçamento e `services/obras.ts`, e no subselect de `medicao where etapa.obraId`. A tabela é lida em toda página de obra e quase nunca escrita. |

Saldo: 6 índices removidos e 7 criados, ou seja, +1 no total. Conferido com `EXPLAIN` sobre 60 mil linhas sintéticas: os itens 1 e 5 viram `Index Scan` sem nó `Sort` e o item 6 vira `Bitmap Index Scan`.

### Sem problema

- **Atividade** `[usuarioId, criadoEm]`, `[criadoEm]` e GIN `[obraIds]`: ESR correto para o feed (`ORDER BY criadoEm DESC`), o perfil e a contagem de 30 dias.
- **TentativaLogin** `[email, criadoEm]`, `[ip, criadoEm]` e `[criadoEm]`: login (`criadoEm > desde`), "últimos acessos" (`DESC LIMIT 10`, varredura reversa) e a limpeza por retenção.
- **Auth.js:** `authorize` e `usuarioAtual` buscam por `id` ou `email`, ambos únicos. O `email` com `mode: 'insensitive'` (ILIKE) não usa o índice único, mas `Usuario` é minúscula.
- **ExecucaoSefaz** `[cnpj, iniciadaEm]` e `[iniciadaEm]`; **UsuarioObra** `@@id` + `[obraId]`; **ItemNota** `[notaId]` e `[materialId]`; **RateioNota** `[obraId]`.

### Avaliado e descartado

- **Parcela `[status, pagaEm DESC NULLS LAST]`** (visão "pagas"): o Prisma não expressa `NULLS LAST` no `@@index`, e o top-N com `LIMIT 300` sobre o prefixo `status` basta.
- **`NotaFiscal.createdBy`, `DiarioObra.autorId` e `Medicao.autorId`:** a cardinalidade é baixa (poucos usuários) e só servem às telas de usuários do ADMIN.
- **Atividade `[tipo, criadoEm]`:** o filtro é `tipo IN (...)`, que não aproveita a ordenação do índice.
- **DocumentoSefaz com 4 colunas para `manifestarPendentes`:** `[manifestacao]` já isola o conjunto pequeno de PENDENTE/ERRO.
- **`sort: Desc` nos demais:** em B-tree de uma coluna, ou com igualdade + uma coluna de ordenação, o Postgres faz varredura reversa sem custo. `Desc` só compensa com direção mista (item 5).

## Para PRs futuros

- Query nova com `where` de igualdade + `orderBy`/intervalo numa tabela que cresce: o índice segue `[igualdade..., ordenação, intervalo]`.
- Antes de criar `@@index([A])`, veja se um `@@index` ou `@@unique` já começa por `A`.
- Tabela pequena (configuração, cadastro) não precisa de índice só por causa de um filtro.
