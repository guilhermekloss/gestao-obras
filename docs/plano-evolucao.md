# Plano de evolução — Gestão de Obras

Benchmark de mercado (out/2026) → mapa de funcionalidades → plano de execução
com múltiplos agentes em paralelo sem conflito.

---

## 1. Benchmark resumido

| Plataforma | Público | O que tem de relevante para nós |
|---|---|---|
| **Sienge** (+ GO, Prevision, Construpoint) | médias/grandes (GO: pequenas) | ERP completo: suprimentos → contas a pagar automático, conciliação bancária, medição de empreiteiro com trilha de auditoria, FVS, cronograma com IA, consulta via WhatsApp |
| **Obra Prima** | pequenas/médias, "mais simples que ERP" | físico-financeiro, curva ABC, RDO, cotação online, previsto × realizado, NF via SEFAZ, portal do cliente |
| **Vobi** | reforma/arquitetura | orçamento por catálogo, cronograma, compras, portal do cliente com aprovações, diário compartilhado, agentes de IA (R$69–199/mês) |
| **Mais Controle** | pequenas/médias | orçamento, compras, estoque, financeiro, RDO no app — foco em simplicidade |
| **OrçaFascio / Volare** | orçamentistas, obra pública | SINAPI/SICRO/TCPO, composições, BDI, RDO offline |
| **Procore** | GCs médios/grandes (EUA) | RFIs, submittals, plantas, qualidade/segurança, change orders |
| **Buildertrend** | residencial (EUA) | cronograma, daily log, portal do cliente, seleções, garantia, IA que transforma o diário em atualização ao cliente |
| **Fieldwire / Autodesk Build** | campo | plantas versionadas, punch list, offline |

**Mínimo esperado** por uma pequena/média construtora brasileira: obra + EAP, orçamento,
cronograma com previsto × realizado, compras, financeiro com rateio por obra, RDO mobile
com fotos, dashboard e permissões.
**Diferenciais dos SaaS leves:** importação de NF-e (XML/SEFAZ), conciliação OFX, medição de
empreiteiro com retenções, portal do cliente, RDO offline com PDF.
**Lacuna de mercado:** IA prática (ler NF/boleto, resumir RDO, alertar desvio) e WhatsApp —
hoje só no ecossistema caro da Sienge ou em ferramentas americanas sem aderência fiscal.

---

## 2. O que o app tem hoje × mercado

| Módulo atual | Situação vs. mercado | Veredito |
|---|---|---|
| **Notas fiscais** (itens, rateio por obra/etapa, parcelas, anexo, aviso de duplicata) | Acima da média em rateio; falta importar XML | **Manter + ampliar** |
| **Contas a pagar + fluxo mensal** | Básico; sem contas a receber, sem saldo de caixa, sem conciliação | **Ampliar** |
| **Fornecedores + score de dependência** | **Nenhum concorrente pesquisado tem** — diferencial | **Manter** (+ dados bancários/PIX, categoria) |
| **Diário de obra (RDO)** | Abaixo do básico: sem edição, sem equipamentos, sem PDF, sem offline | **Ajustar** |
| **Medições** (% físico por etapa) | Nome confunde com "medição de empreiteiro" do mercado; sem previsto | **Ajustar** → vira "Avanço físico" dentro do Cronograma |
| **Orçamento** (1 valor por etapa) | Simples demais vs. mercado, mas adequado ao porte | **Ajustar** (curva ABC, alertas); composições/SINAPI só depois |
| **Obras + etapas** | EAP de 1 nível; sem datas, sem cliente | **Ajustar** (datas previstas, cliente, área) |
| **Dashboard** | KPIs bons; falta curva S, ABC, alertas | **Ampliar** |
| **Importar CSV** | Ferramenta de migração única — dados reais já importados | **Excluir do menu** (manter código 1 ciclo, depois remover) |
| **Usuários / 3 papéis** | ~~CAMPO vê todas as obras; sem log de auditoria~~ feito: permissão por obra, log de auditoria, convite por link e página de atuação do usuário | **Ajustar** ✅ |

### Ajustes e correções encontrados no código

1. Editar NF com parcelas pagas **recria as parcelas como abertas** (perde pagamentos) — preservar pagamentos por número de parcela.
2. **Todo custo exige NF** — não há como lançar mão de obra, diárias, impostos ou taxas sem nota. Custo da obra fica subestimado. → "Lançamento" com tipo de documento (NF, recibo, folha, guia).
3. Dashboard: "Gasto no mês" soma `nota.totalCents`, mas os gráficos somam itens — números divergem quando há divergência itens × nota.
4. RDO e medição não têm edição (só excluir e relançar).
5. Storage de arquivos é disco local (`./uploads`) — precisa de driver S3/R2 antes do deploy.
6. `realizadoPorObra` carrega todas as NFs em memória — ok hoje, vira agregação SQL quando o volume crescer.

### O que **não** construir (fora do perfil do produto)

BIM, RFIs/submittals, linha de balanço, CNAB/pagamento escritural, licitações,
CRM/funil de vendas, base SINAPI completa (avaliar só se surgir demanda de obra pública).

---

## 3. Backlog priorizado

**Onda 1 — aproveita dados que já existem, alto valor, baixo risco**

| # | Item | Agente |
|---|---|---|
| 1.1 | Lançamentos sem NF (recibo/folha/guia) + preservar pagamentos ao editar NF | A1 Financeiro |
| 1.2 | Importação de XML de NF-e (upload do XML → nota pré-preenchida, fornecedor por CNPJ) | A2 NF-e |
| 1.3 | Cronograma: datas previstas por etapa, Gantt simples, curva S previsto × realizado; Medições vira aba "Avanço" | A3 Planejamento |
| 1.4 | RDO: edição, equipamentos, clima por turno (manhã/tarde, dia impraticável), versão para impressão/PDF | A4 Diário |
| 1.5 | Curva ABC de insumos, alertas de estouro por etapa, correção do KPI "gasto no mês" | A5 Análises |

**Onda 2 — novos domínios** (em ordem de prioridade)

| # | Item | Agente |
|---|---|---|
| 2.1 | Contratos de empreiteiro + medição de serviço (retenção caução, INSS 11%, ISS) gerando parcelas a pagar — mão de obra é o maior custo que hoje fica fora do sistema | A6 Contratos |
| 2.2 | Compras: solicitação → mapa de cotação → pedido → NF vinculada | A7 Suprimentos |
| 2.3 | Contas a receber (cliente/obra), fluxo de caixa realizado + projetado | A8 Recebíveis |
| 2.4 | Documentos da obra (plantas, contratos, alvarás) + driver S3/R2 | A9 Documentos |
| 2.5 | Plataforma (transversal, roda sozinho na Fase 0 da Onda 2): ~~permissão por obra para CAMPO, log de auditoria em `acaoDeEscrita`~~ (feito, junto com convite por link), dados bancários/PIX do fornecedor | Fundação |

**Onda 3 — diferenciais**

Portal do cliente (link só leitura: avanço, fotos, RDOs) — as obras atuais são lotes da própria
empresa, então o portal só faz sentido quando houver obra por encomenda · checklists/FVS simples ·
estoque por obra · conciliação OFX · IA: ~~leitura de NF em PDF/foto~~ (feito — ver
[`leitura-nota-fiscal.md`](leitura-nota-fiscal.md)) e resumo semanal do
RDO para o cliente · notificações por WhatsApp.

---

## 4. Organização dos agentes (sem interferência)

### Princípio: contratos primeiro, depois paralelo

Os pontos de colisão do repositório são poucos e conhecidos:
`prisma/schema.prisma`, `prisma/migrations/`, `src/components/nav.tsx`,
`src/app/(app)/dashboard/page.tsx`, `src/app/(app)/obras/[id]/page.tsx`,
`src/lib/*`, `package.json`/`package-lock.json`.
Todos eles são alterados **uma única vez, por um único agente, antes** da onda começar.

### Fase 0 — Agente Fundação (sozinho, sequencial) — ✅ feita na Onda 1

1. **Schema da onda inteira numa migração só** (`20261014100000_onda1_fundacao`). Durante a onda
   o schema fica **congelado** — nenhum agente gera migração. Campos da Onda 1:
   - `NotaFiscal.tipoDocumento` (NF, RECIBO, FOLHA, GUIA, OUTRO) e `FormaPagto` + TRANSFERENCIA, DINHEIRO → A1
   - `NotaFiscal.chaveNfe` (único) → A2
   - `Etapa.inicioPrevisto`, `Etapa.fimPrevisto` → A3
   - `DiarioObra.climaManha`, `climaTarde`, `condicao` (PRATICAVEL/PARCIAL/IMPRATICAVEL), `equipamentos` (Json), `updatedAt` → A4
   - correção de drift: os 4 índices de FK que existiam nas migrações mas não no schema.
2. **Menu:** Cronograma (`/cronograma`) substitui Medições; Importar sai do menu (rota mantida).
3. **Página da obra em abas:** `obras/[id]/page.tsx` virou casca com abas Resumo · Cronograma · Diário,
   cada uma em `obras/[id]/abas/<aba>.tsx` com o contrato `AbaObraProps` (`obraId`, `role`).
4. **Dashboard:** slot `dashboard/widgets/curva-s.tsx` (stub do A3) já importado na página.
5. **Dependência instalada:** `fast-xml-parser` (A2). PDF do RDO sai por página de impressão — sem dependência.
6. `.claude/` (worktrees dos agentes) excluído do `tsc` e do `eslint` do repositório principal.
7. Validado: `lint`, `tsc --noEmit`, `vitest`, `build` e navegação nas abas.

### Fase 1 — agentes em paralelo

Cada agente roda em **git worktree próprio** (branch `feat/<agente>`) e com **banco próprio**
(`DATABASE_URL=.../gestao_obras_<agente>`), aplicando a migração da Fase 0.

| Agente | Pode alterar (exclusivo) | Lê, mas não altera |
|---|---|---|
| **A1 Financeiro** | `src/app/(app)/notas/` (exceto `importar-xml/`), `src/app/(app)/contas/`, `src/services/parcelas.ts`, `financeiro.ts`, `src/schemas/nota.ts` | `rateio.ts`, `custos.ts` |
| **A2 NF-e** | `src/app/(app)/notas/importar-xml/`, `src/services/nfe-xml.ts` (+ testes) | `schemas/nota.ts`, `services/fornecedores.ts`, `rateio.ts` |
| **A3 Planejamento** | `src/app/(app)/medicoes/`, `src/app/(app)/cronograma/`, `obras/[id]/abas/cronograma.tsx`, `src/services/cronograma.ts`, `services/obra.ts`, `dashboard/widgets/curva-s.tsx` | `custos.ts` |
| **A4 Diário** | `src/app/(app)/diario/`, `obras/[id]/abas/diario.tsx`, `src/services/rdo.ts` | `lib/storage.ts`, `api/upload` |
| **A5 Análises** | `src/app/(app)/dashboard/` (exceto `widgets/curva-s.tsx`), `src/app/(app)/orcamento/`, `src/services/analises.ts`, `custos.ts` | todo o resto |

Regras para todos os agentes:

- **Não tocar** em `prisma/`, `nav.tsx`, `lib/`, `components/ui/`, `package.json`, nem em arquivos de outro agente.
  Se precisar, escreve o pedido em `docs/handoff/<agente>.md` e segue com um contorno local.
- Ler `node_modules/next/dist/docs/` antes de escrever código (Next 16 — ver `AGENTS.md`).
- Seguir os padrões existentes: dinheiro em centavos, percentual em basis points, regra de negócio
  pura e testada em `src/services/`, escrita só via `acaoDeEscrita`.
- Antes de entregar: `lint`, `tsc`, `vitest` verdes e testes novos para os services criados.
- Entrega = branch + `docs/handoff/<agente>.md` (o que foi feito, pendências, pedidos).

### Status da Onda 1 — ✅ integrada

Os 5 branches foram integrados sem conflito (cada agente ficou nas suas pastas). Pedidos dos
handoffs (`docs/handoff/A*.md`) aplicados pelo integrador: menu "Lançamentos", botões "Importar XML",
chave NF-e na edição, links RDO/Cronograma na aba Resumo, textos de Avanço, README.
Validação: `tsc`, `eslint` (0 erros), 217 testes Vitest, `next build`, e2e Playwright (2/2) e
smoke de todas as rotas como ADMIN e CAMPO.

**Achados dos agentes que entram no início da Onda 2 (Fase 0, transversal):**
- **Fuso horário de datas.** Colunas `@db.Date` e datas gravadas à meia-noite UTC aparecem um
  dia antes num servidor fora de UTC. Padronizar um helper `dataCivil` em `lib/format.ts`
  (hoje existe como `dataDoRdo` em `services/rdo.ts`) e migrar as datas de parcela/compra para meio-dia.
  Até lá, rodar o servidor em UTC.
- `StorageDriver.remover(url)` para não deixar fotos órfãs (junto com o driver S3/R2 do A9).
- Upload de NF-e limitado a 900 KB (limite de 1 MB das server actions) — avaliar `serverActions.bodySizeLimit`.
- Curva ABC, alertas e custos leem todas as notas em memória — virar agregação SQL quando o volume crescer.

### Fase 2 — Agente Integrador (sozinho)

Faz o merge das branches em ordem fixa (A1 → A2 → A3 → A4 → A5), atende os pedidos dos
`handoff/`, liga os widgets e abas, roda `lint` + `tsc` + `vitest` + `build` + Playwright
após **cada** merge e abre um PR por onda.

A Onda 2 repete o ciclo Fundação → paralelo → Integração com A6–A9.

```
Fase 0  Fundação ──────────────┐
                               ├─ A1 Financeiro ─┐
                               ├─ A2 NF-e ───────┤
Fase 1  (worktrees paralelos)  ├─ A3 Planejamento┼─ Fase 2  Integrador → PR Onda 1
                               ├─ A4 Diário ─────┤
                               └─ A5 Análises ───┘
```

---

## 5. Decisões tomadas

1. **Importar CSV** sai do menu (rota `/importar` continua acessível; código removido num ciclo futuro).
2. **Medições** vira a aba "Avanço" do Cronograma e sai do menu.
3. Ordem da Onda 2: **contratos de empreiteiro → compras → contas a receber**.
4. **Portal do cliente** fica na Onda 3.
5. **Offline fica fora** por enquanto (sem service worker / PWA offline).
