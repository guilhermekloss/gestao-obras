# Análise competitiva — Cofield × Gestão de Obras

Estudo do [Cofield](https://cofield.com.br) (Controle sua Obra) para identificar o que ele tem e o
nosso app não tem. Data: 22/10/2026.

## Fontes e limites

- **Capturas de tela do produto** (cadastro, onboarding de 9 passos, criação de projeto em 5 etapas,
  planos e menu). É a fonte principal: o que aparece nelas está marcado como **confirmado**.
- **Postagens de divulgação no LinkedIn** ([Vicente Falkowski](https://www.linkedin.com/in/vicente-falkowski/),
  [Alexandre Junior](https://www.linkedin.com/in/alexandreg-jr/)): descrevem cronogramas múltiplos,
  Last Planner integrado, rastreio de restrições e planejamento com IA, e falam em mais de 250 obras na
  plataforma. São afirmações de marketing, marcadas como **divulgado**.
- O site `cofield.com.br` **não pôde ser lido**: a política de rede deste ambiente bloqueia o domínio.
  O conteúdo dos módulos por dentro (telas de Semanal, Restrições, Histograma etc.) não foi visto. O que
  vem do nome do módulo e da prática de mercado está marcado como **inferido**. Vale confirmar numa
  demonstração ou no teste grátis.

---

## 1. O que é o Cofield

SaaS de **planejamento e controle de obra** com foco em Lean Construction (Last Planner), vendido por
módulo e por projeto. O centro do produto é o **planejamento**: cronograma, planejamento semanal,
restrições e histograma. Custos e orçamento existem, mas o Custos só entra no plano mais caro. Isso é o
contrário do nosso app, que nasceu do **financeiro** (lançamentos, rateio, contas, NF-e) e tem o
planejamento mais simples.

### Módulos e planos (confirmado)

| Plano | Preço de referência | Módulos que o plano acrescenta | Descrição do plano |
|---|---|---|---|
| Lite | R$ 349/mês | Planejamento | "Para começar com diário e planejamento essencial" |
| Plus | R$ 799/mês | Semanal, Orçamento | "Mais controle da rotina, qualidade e produção semanal" |
| Pro | R$ 999/mês | Restrições, Histograma, Suprimentos | "Cobertura forte para gerir obra com custos, orçamento e suprimentos" |
| Enterprise | R$ 1.299/mês | Custos, Integração | "Todos os módulos para operações completas e integradas" |

Preço **por projeto** (cada projeto escolhe o próprio plano). O primeiro projeto do workspace tem 7 dias
grátis.

### Estrutura da plataforma (confirmado)

- **Workspace** (organização) com seletor no topo e logo; dentro dele, **projetos** com seletor próprio
  (o "C2" no menu lateral).
- Menu lateral por módulo: Visão geral (dashboard modular), Planejamento, Semanal, Restrições,
  Histograma, Suprimentos, Orçamento, Custos, Integração, Configurações, **Notificações** (sino) e
  **Tutoriais**.
- **Onboarding self-service em 9 passos**: tipo de empresa, papel da pessoa, tipo de obra, tamanho da
  operação, ferramentas usadas hoje (Excel, Project, Primavera, Prevision, Agilean, Gescorp), como
  conheceu, telefone, nome e imagem do workspace, convite de pessoas com perfil (Membro/admin).
- **Assistente de criação de projeto em 5 etapas**: nome e módulos, plano (com recomendação), cobrança,
  pessoas do projeto e resumo.

---

## 2. Comparação módulo a módulo

Legenda: ✅ temos · 🟡 parcial · ❌ não temos

| Cofield | Nosso app hoje | Situação |
|---|---|---|
| **Planejamento** (cronograma) | Cronograma com Gantt, curva S previsto × realizado, avanço físico por etapa (`/cronograma`) | 🟡 |
| **Semanal** (Last Planner) | Nada equivalente. O RDO registra o que foi feito, mas não há plano da semana | ❌ |
| **Restrições** | Nada equivalente | ❌ |
| **Histograma** | O RDO guarda o efetivo por dia (`DiarioObra.efetivo`), mas não há previsto nem gráfico | 🟡 (só o dado realizado) |
| **Suprimentos** | Catálogo de materiais e fornecedores; a compra só aparece depois da nota | ❌ (previsto na Onda 2, item 2.2) |
| **Orçamento** | Um valor por etapa, curva ABC, alertas de estouro | 🟡 |
| **Custos** | Lançamentos (NF, recibo, folha, guia), rateio por obra, contas a pagar, fluxo mensal, leitura de NF por foto/PDF/XML, captura automática na Sefaz | ✅ provavelmente mais forte que o deles |
| **Integração** | Só a Sefaz. Sem API, ERP ou BI | ❌ |
| **Visão geral** (dashboard modular) | Dashboard fixo com KPIs, curva S, ABC e alertas | 🟡 |
| **Diário** (citado no plano Lite) | RDO completo: clima por turno, efetivo, equipamentos, fotos, impressão | ✅ |
| **Notificações** | Nenhuma: alertas só aparecem dentro do dashboard | ❌ |
| **Tutoriais** | Assistente de navegação: tour, central de ajuda com guias, perguntas à IA | ✅ |
| **Workspaces / multiempresa** | Uma empresa só (`Empresa` com id fixo `principal`) | ❌ |
| **Planos, cobrança e teste grátis** | Não se aplica hoje (uso interno) | ❌ |
| **Cadastro e onboarding self-service** | Só por convite do admin | ❌ |
| **Módulos ligados/desligados por projeto** | Todos os módulos para todas as obras | ❌ |
| **Pessoas por projeto** | Permissão por obra (CAMPO), aba Equipe, convite por link | ✅ |

---

## 3. Funcionalidades que o Cofield tem e nós não temos

### 3.1 Planejamento semanal — Last Planner (❌)

**Divulgado:** "lookahead ligado no cronograma". **Inferido** do método, que é o padrão de mercado:

- **Lookahead** (médio prazo, de 4 a 6 semanas): puxa do cronograma as atividades das próximas semanas
  e mostra o que precisa ficar liberado.
- **Plano semanal**: pacotes de trabalho com responsável, quantidade e dia, tirados do lookahead.
- **PPC** (Percentual de Planos Concluídos): pacotes concluídos ÷ planejados, semana a semana, com
  gráfico de tendência.
- **Causas de não cumprimento** (mão de obra, material, chuva, projeto, equipamento…) com Pareto.

**Por que importa para nós:** liga o escritório (cronograma) ao campo (RDO). Hoje o RDO diz o que
aconteceu, mas ninguém compara com o que estava planejado para a semana. O usuário CAMPO já existe e já
usa o celular.

### 3.2 Gestão de restrições (❌)

**Divulgado:** "restrição rastreada até ser resolvida". **Inferido:** cada restrição tem tipo (material,
projeto, mão de obra, equipamento, liberação, financeiro), atividade do cronograma ou do lookahead
ligada a ela, responsável, data-limite e status (aberta, em andamento, removida). Uma atividade só entra
no plano semanal sem restrição aberta.

**Gancho no nosso app:** restrição de material poderia virar solicitação de compra quando o módulo de
compras (2.2) existir. Restrição financeira conversa com o fluxo de caixa.

### 3.3 Histograma de mão de obra (🟡)

**Inferido:** quantidade de pessoas por função ao longo do tempo, previsto (do cronograma) × real (do
campo).

**Temos metade:** o efetivo diário do RDO já é o realizado. Falta:
- efetivo previsto por etapa (pessoas × função × período);
- gráfico semanal ou mensal, previsto × real, por obra e consolidado;
- produtividade (avanço físico ÷ homem-hora), cruzando com as medições do cronograma.

É o item de **melhor custo-benefício** desta lista, porque o dado mais difícil (o real) já é coletado.

### 3.4 Cronograma mais completo (🟡)

| Recurso | Cofield | Nós |
|---|---|---|
| Gantt | ✅ (confirmado) | ✅ |
| Curva S | provável | ✅ |
| **Vários cronogramas no mesmo projeto** (incorporação, pré-obra, projetos, suprimentos, obra) | ✅ divulgado | ❌ um por obra |
| **EAP com vários níveis** | provável (padrão MS Project) | ❌ etapas de um nível |
| **Dependências entre atividades** | provável | ❌ |
| **Linha de base** (planejado original × atual) | provável | ❌ |
| **Importar do MS Project/Primavera/Excel** | inferido (o onboarding pergunta quais dessas ferramentas a empresa usa e o post diz que "substitui o Project") | ❌ |
| **Planejamento com IA** | divulgado | ❌ (temos IA só na leitura de nota e no assistente) |

EAP, dependências e linha de base já estão no nosso backlog de prioridade média
([`assistente-e-fluxos.md`](assistente-e-fluxos.md#5-auditoria-de-fluxos--mercado)).

### 3.5 Suprimentos (❌)

**Inferido** da descrição do plano Pro e do cronograma de suprimentos divulgado: plano de compras
derivado do cronograma (data de necessidade na obra menos o prazo de entrega dá a data limite do pedido)
e acompanhamento do pedido até a entrega.

Nosso item 2.2 (solicitação → cotação → pedido → NF vinculada) cobre o fluxo de compra, mas **não a
ligação com o cronograma**. Vale incluir no escopo a "data de necessidade" calculada a partir da etapa.

### 3.6 Integração (❌)

**Inferido:** troca de dados com ERP (Sienge e similares), BI ou API. Hoje só falamos com a Sefaz.
O mínimo útil para nós seria exportar CSV/Excel (já está no backlog de baixa prioridade) e, depois, uma
API somente leitura para BI.

### 3.7 Dashboard modular (🟡)

**Confirmado:** "Dashboard modular", com cartões por módulo ativo do projeto. O nosso é fixo. Ele
poderia mostrar cartões conforme o papel do usuário (CAMPO sem valores, ESCRITORIO com o financeiro) e,
se o Semanal existir, PPC e restrições vencidas.

### 3.8 Notificações (❌)

**Confirmado:** sino no menu lateral. Nossos alertas (parcela vencida, estouro de orçamento, nota
divergente) só aparecem para quem abre o dashboard. Faltam uma central de notificações e um canal externo
(e-mail ou WhatsApp, que já está na Onda 3).

### 3.9 Plataforma SaaS (❌)

Todos confirmados:
- várias organizações (workspaces) isoladas, com troca rápida entre elas;
- cadastro self-service e questionário de onboarding (segmentação comercial: tipo de empresa, porte,
  ferramentas atuais, origem do lead);
- planos com módulos, recomendação de plano, teste grátis de 7 dias, cobrança por projeto;
- módulos ligados e desligados por projeto;
- logo do workspace.

**Só faz sentido se o app passar a ser vendido para outras empresas.** Hoje ele atende uma empresa
(lotes próprios), e o modelo `Empresa` é registro único. Multiempresa mexe em todas as consultas
(isolamento por `empresaId`) e em segurança. É uma decisão de produto, não uma lacuna técnica.

---

## 4. O que temos e o Cofield não mostra

Com base nas capturas, nos posts e na distribuição dos planos:

- **Financeiro de obra de verdade**: lançamentos com parcelas, rateio por obra e etapa, contas a pagar,
  fluxo mensal. No Cofield, Custos só existe no Enterprise.
- **Leitura automática de nota** (foto, PDF, XML) com conferência, e **captura automática na Sefaz**
  (manifestação, certificado A1).
- **Catálogo de materiais** com vínculo automático aos itens das notas e **curva ABC** de insumos.
- **Score de dependência de fornecedor**, que nenhum concorrente pesquisado tem (ver
  [`plano-evolucao.md`](plano-evolucao.md)).
- **Papel CAMPO sem acesso a valores**, bloqueado no servidor, com permissão por obra e log de auditoria
  por usuário.

O nosso posicionamento natural é "controle de custo e caixa da obra, com o planejamento que o campo usa".
O do Cofield é "planejamento lean, com custo como extra".

---

## 5. Observações de UX no fluxo deles (para não repetir)

- Recomenda o plano **Enterprise** com só Planejamento e Semanal marcados. A recomendação parece forçar
  a venda e confunde quem está testando.
- A descrição do Pro fala em "custos e orçamento", mas Custos só existe no Enterprise.
- Erro de concordância ("1 módulos incluídos") e texto repetido na etapa "Pessoas do projeto".
- "Total mensal R$ 0,00" riscado no resumo: não diz quanto vai custar depois do teste.
- No celular, a Visão geral fica cortada na lateral: o menu ocupa a tela e o conteúdo vaza para a direita.
- Dois assistentes seguidos (9 + 5 passos) antes de ver qualquer dado.

---

## 6. Recomendação de prioridade

Alinhada ao [`plano-evolucao.md`](plano-evolucao.md). O que não estava previsto lá está marcado como
**novo**.

| Prioridade | Item | Por quê | Encaixe no plano |
|---|---|---|---|
| **Alta** | **Histograma de mão de obra** (previsto por etapa × real do RDO, produtividade) | O dado real já existe. Esforço baixo e efeito visível no dashboard | **novo** (domínio do Planejamento) |
| **Alta** | **Planejamento semanal + PPC + causas** (versão enxuta do Last Planner, sem lookahead formal no começo) | Liga cronograma e RDO, e dá ao campo um motivo para abrir o app antes do serviço, não só depois | **novo** |
| **Alta** | **Restrições** com responsável, prazo e status, ligadas à etapa | Base do Last Planner. Restrição de material alimenta Compras | **novo**, logo depois do Semanal |
| Média | EAP com níveis, dependências e linha de base | Sem linha de base não se mede atraso contra o planejado original | já no backlog (média) |
| Média | Importar cronograma do MS Project (XML) e do Excel | Tira a barreira de entrada de quem já tem cronograma | **novo** |
| Média | Compras ligadas ao cronograma (data de necessidade) | Ampliação do item 2.2 já previsto | 2.2 + **novo** escopo |
| Média | Central de notificações (alertas existentes + restrições vencidas) | Os alertas já existem, só não chegam a ninguém | **novo** (WhatsApp segue na Onda 3) |
| Baixa | Dashboard configurável por papel e por módulo | Conveniência | **novo** |
| Baixa | Exportação CSV/Excel e API de leitura para BI | Primeiro passo de "Integração" | backlog (baixa) |
| Baixa | IA no planejamento (sugerir etapas e durações por tipo de obra, sugerir restrições) | Já temos Gemini integrado | **novo** |
| Decisão de produto | Multiempresa, onboarding self-service, planos e cobrança, módulos por projeto | Só se o app for vendido como SaaS | fora do plano atual |

**Continua fora**, como já decidido no plano: linha de balanço, BIM, CNAB.
