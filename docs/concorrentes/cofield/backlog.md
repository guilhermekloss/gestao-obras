# Cofield: backlog

O que o Cofield tem e não entra no PR 2 (cronograma) nem no PR 3 (orçamento × custos), em ordem de
prioridade. O que entra agora está no [comparativo](comparativo.md#o-que-entra-agora). Ao começar um
item, releia a seção da [análise](analise-plataforma.md) indicada na ficha: as regras de negócio
deles (travas, fórmulas, estados) estão lá.

Esforço: **P** cabe num PR pequeno, sem migração grande · **M** um PR com modelo novo e uma tela ·
**G** um domínio novo, vários PRs ou mudança que atravessa o app.

Encaixe nas ondas do [`plano-evolucao.md`](../../plano-evolucao.md#3-backlog-priorizado): os itens de
planejamento lean (Semanal, Restrições, Histograma) não existiam no plano e são propostos como uma onda
própria, **Planejamento**, depois da Onda 2.

## Resumo

| # | Item | Prioridade | Esforço | Encaixe |
|---|---|---|---|---|
| 1 | [Histograma de mão de obra](#histograma-de-mão-de-obra) | **Alta** | M | Novo · onda Planejamento (pode vir antes) |
| 2 | [Semanal, PPC e motivos de atraso](#semanal-ppc-e-motivos-de-atraso) | **Alta** | G | Novo · onda Planejamento |
| 3 | [Restrições com IRR e responsável externo](#restrições-com-irr-e-responsável-externo) | **Alta** | M | Novo · onda Planejamento, depois do Semanal |
| 4 | [Suprimentos com lead time retroativo](#suprimentos-com-lead-time-retroativo) | **Alta** | M | Onda 2 · amplia o item 2.2 |
| 5 | [Notificações por e-mail e in-app](#notificações-por-e-mail-e-in-app) | **Alta** | M | Onda 2 (in-app) · Onda 3 (WhatsApp) |
| 6 | [Troca e histórico da linha de base](#troca-e-histórico-da-linha-de-base) | Média | P | Logo depois do PR 2 |
| 7 | [Custos com comprometido, fórmulas, CUB e trava com motivo](#custos-com-comprometido-fórmulas-cub-e-trava-com-motivo) | Média | M | Onda 2 · junto do 2.2 (comprometido) |
| 8 | [Calendário em dias úteis](#calendário-em-dias-úteis) | Média | M | Onda 2 · adições |
| 9 | [EAP em árvore](#eap-em-árvore) | Média | G | Onda 2 · adições (já no backlog médio) |
| 10 | [Predecessoras e CPM](#predecessoras-e-cpm) | Média | G | Onda 2 · adições (já no backlog médio) |
| 11 | [Importação e exportação do cronograma](#importação-e-exportação-do-cronograma) | Média | G | Onda 2 · adições, depois da EAP |
| 12 | [IA no cronograma, no orçamento e no histograma](#ia-no-cronograma-no-orçamento-e-no-histograma) | Média | M | Onda 3 · IA |
| 13 | [Metas mensais da curva S](#metas-mensais-da-curva-s) | Baixa | P | Backlog do cronograma |
| 14 | [Desafio](#desafio) | Baixa | P | Backlog do cronograma |
| 15 | [Replanejar obra](#replanejar-obra) | Baixa | M | Depois de predecessoras e CPM |
| 16 | [Versões e rascunho do cronograma](#versões-e-rascunho-do-cronograma) | Baixa | G | Depois da EAP |
| 17 | [Vinculação orçamento ↔ etapas por itens](#vinculação-orçamento--etapas-por-itens) | Baixa | G | Depois de orçamento com itens |
| 18 | [Escadinha e linha de balanço](#escadinha-e-linha-de-balanço) | Baixa | M | Rever o "não construir" do plano |
| 19 | [Qualidade e FVS](#qualidade-e-fvs) | Baixa | G | Onda 3 · checklists/FVS |
| 20 | [Integração ERP e API](#integração-erp-e-api) | Baixa | G | Backlog baixo · exportação e API |
| 21 | [RBAC customizável](#rbac-customizável) | Baixa | M | Plataforma (2.5) |
| 22 | [Multiempresa e planos](#multiempresa-e-planos) | Decisão de produto | G | Fora do plano atual |

Por prioridade: **5 altas, 7 médias, 9 baixas e 1 decisão de produto** (22 itens).

---

## Alta

### Histograma de mão de obra

- **No Cofield:** efetivo previsto por ofício e por dia, calculado como quantitativo ÷ produtividade ÷
  duração, a partir das datas do Gantt; curva de carga diária com picos e vales; "Estimar por IA" para
  os quantitativos. [§4.6](analise-plataforma.md#46-histograma-de-mão-de-obra)
- **O que já temos:** o **realizado** já é coletado. O RDO grava o efetivo do dia por função
  (`DiarioObra.efetivo`, lista de `{ funcao, qtd }`, validada em `validarEfetivo` e somada em
  `totalPessoas` em `src/services/rdo.ts`). As etapas têm datas previstas (`Etapa.inicioPrevisto`,
  `fimPrevisto`).
- **Pré-requisitos:** catálogo de funções com nome padronizado (o efetivo do RDO é texto livre); efetivo
  previsto por etapa (pessoas × função, ou quantitativo × produtividade).
- **Esforço:** M. Modelo de previsto por etapa, gráfico semanal previsto × real por obra e
  consolidado; produtividade (avanço físico ÷ homem-dia) cruzando com as medições.
- **Prioridade:** Alta. O dado mais difícil (o real) já existe; efeito visível no dashboard.
- **Encaixe:** novo. Abre a onda Planejamento e pode ser antecipado para logo depois do PR 3, porque não
  depende de Semanal nem de Restrições.

### Semanal, PPC e motivos de atraso

- **No Cofield:** ciclo Rascunho → Iniciada (plano travado) → Finalizada (PPC congelado, abre a próxima
  semana) ou Pulada; PPC binário (só tarefa 100% conta); não fecha a semana com atraso sem motivo do
  catálogo; responsável aponta o status por página pública, sem conta; "Salvar medição" grava o avanço
  da semana. [§4.4](analise-plataforma.md#44-semanal-last-planner-system)
- **O que já temos:** etapas com datas (de onde sai o que cai na semana); `Medicao` com data e avanço
  acumulado (`criarMedicao`, que o CAMPO já usa); RDO diário com atividades; papel CAMPO no celular;
  link de uso único com hash no banco (`src/lib/token.ts`, modelo `Convite`) como padrão para a página
  pública.
- **Pré-requisitos:** status Atenção e desvio do PR 2; de preferência a [EAP](#eap-em-árvore), para
  planejar pacotes menores que a etapa (sem ela, a semana fica grossa demais).
- **Esforço:** G. Modelos de semana, item da semana e motivo; tela do plano semanal; PPC e Pareto de
  motivos no dashboard; página pública para o responsável.
- **Prioridade:** Alta. Liga o escritório (cronograma) ao campo (RDO) e dá ao CAMPO um motivo para abrir
  o app antes do serviço, não só depois.
- **Encaixe:** novo, onda Planejamento. Começar enxuto: sem lookahead formal e sem subtarefas.

### Restrições com IRR e responsável externo

- **No Cofield:** plano de ação com tipo, criticidade e ID; ações com responsável, prazo, status e
  histórico; vínculo a tarefas (badge na barra do Gantt); responsável externo atualiza por link sem
  conta; IRR = removidas ÷ identificadas, por responsável, setor e tipo; e-mail quando vence.
  [§4.5](analise-plataforma.md#45-restrições)
- **O que já temos:** etapas e Gantt para mostrar o badge; `Usuario` e `Fornecedor` como responsáveis;
  padrão de token com hash para o link externo (`src/lib/token.ts`); log de auditoria para o histórico.
- **Pré-requisitos:** nenhum técnico. Faz mais sentido com o [Semanal](#semanal-ppc-e-motivos-de-atraso)
  (uma etapa com restrição aberta não deveria entrar na semana) e com
  [notificações](#notificações-por-e-mail-e-in-app) para cobrar o prazo.
- **Esforço:** M.
- **Prioridade:** Alta. É o diferencial que o próprio Cofield destaca, e lá só existe no plano Pro.
  Restrição de material pode virar solicitação de compra quando o 2.2 existir.
- **Encaixe:** novo, onda Planejamento, logo depois do Semanal.

### Suprimentos com lead time retroativo

- **No Cofield:** etapas de compra configuráveis (solicitação 10 d, cotação 20 d, pedido 10 d,
  mobilização 20 d, folga 5 d); a data de cada etapa é calculada de trás para frente a partir do início
  da tarefa no Gantt e se move junto com ela; lead time por item; desvio = real − planejado; e-mail
  semanal de atrasos. [§4.7](analise-plataforma.md#47-suprimentos)
- **O que já temos:** `Etapa.inicioPrevisto` (a data de referência); catálogo de materiais
  (`Material`) e fornecedores; a NF vinculada fecha o ciclo.
- **Pré-requisitos:** o item **2.2 Compras** do plano (solicitação → cotação → pedido → NF). Sem ele não
  há onde registrar as datas reais.
- **Esforço:** M, em cima do 2.2.
- **Prioridade:** Alta. Muda pouco o 2.2 e evita que a compra seja surpresa.
- **Encaixe:** Onda 2, **amplia o 2.2**: acrescentar ao escopo a "data de necessidade" pela etapa e o
  lead time padrão por etapa de compra.

### Notificações por e-mail e in-app

- **No Cofield:** 12 tipos por e-mail além do in-app: semana LPS perto do fim, cronograma sem salvar,
  ação de restrição atribuída ou vencendo, resumo semanal de suprimentos, menção, FVS e NC.
  [§5.3](analise-plataforma.md#53-notificações-e-mail-além-do-in-app)
- **O que já temos:** os alertas já são calculados (`carregarAlertas` em `src/services/analises.ts`:
  orçamento, parcela vencida, nota divergente, Sefaz) e o PR 3 acrescenta etapa atrasada e tendência de
  estouro. Só aparecem para quem abre o dashboard.
- **Pré-requisitos:** central in-app (sino com lido/não lido por usuário); provedor de e-mail; job
  agendado (a captura Sefaz já roda em horário fixo, ver [`captura-sefaz.md`](../../captura-sefaz.md));
  preferências por usuário.
- **Esforço:** M.
- **Prioridade:** Alta. Os alertas existem, só não chegam a ninguém.
- **Encaixe:** Onda 2 para o in-app e o e-mail; WhatsApp continua na Onda 3.

---

## Média

### Troca e histórico da linha de base

- **No Cofield:** várias referências (fotos do cronograma) com papéis de linha de base oficial e desafio;
  a foto guarda datas e pesos; "Atualizar pesos" com frase de confirmação; tabela de variância campo a
  campo. [§4.1, "Linha de base, desafio e variância"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** o PR 2 cria **uma** linha de base por obra.
- **Pré-requisitos:** PR 2.
- **Esforço:** P. Guardar as anteriores, escolher qual é a oficial, tabela de variância.
- **Prioridade:** Média. Reprogramação contratual acontece; sem histórico, a troca apaga o atraso
  acumulado.
- **Encaixe:** logo depois do PR 2.

### Custos com comprometido, fórmulas, CUB e trava com motivo

- **No Cofield:** colunas realizado, comprometido, estoque e saldo = orçamento − (realizado +
  comprometido); até 5 colunas com fórmula e fórmula da tendência editável; correção monetária por CUB;
  trava de linha a 100% físico com motivo de estouro obrigatório (catálogo CSO); ajuste manual com
  motivo. [§4.9](analise-plataforma.md#49-custos)
- **O que já temos:** realizado por etapa e por mês (`src/services/custos.ts`); o PR 3 traz valor
  agregado, IDC, tendência e desembolso.
- **Pré-requisitos:** comprometido depende do **2.2** (pedido de compra) e do **2.1** (contrato de
  empreiteiro); CUB precisa de uma fonte de índice mensal.
- **Esforço:** M (comprometido e trava com motivo); fórmulas editáveis seriam G e ficam por último.
- **Prioridade:** Média. O comprometido já está como Alta no plano (2.2 "acrescentar custo
  comprometido"); aqui entra o resto.
- **Encaixe:** Onda 2, junto do 2.2.

### Calendário em dias úteis

- **No Cofield:** `4d` dias úteis, `3dd` corridos, `24h` horas; calendário do projeto com dias
  trabalhados, feriados e exceções; calendários alternativos por pacote.
  [§4.1, "Durações e calendário"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** o previsto é linear em dias corridos (`previstoEtapaNaData` em
  `src/services/cronograma.ts`); o RDO marca dia impraticável (`CondicaoTrabalho`).
- **Pré-requisitos:** cadastro de feriados (nacionais e do município da obra).
- **Esforço:** M. Toca toda a conta de previsto, desvio e IDP.
- **Prioridade:** Média. Distorce o previsto em obras curtas e em dezembro.
- **Encaixe:** Onda 2, adições. O dia impraticável do RDO pode alimentar a tendência depois.

### EAP em árvore

- **No Cofield:** pacotes (somente leitura, somam os filhos) e folhas (onde se editam datas, avanço e
  custo); indentar e desindentar. [§4.1, "Estrutura de dados"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** `Etapa` de um nível com `ordem`; o rateio aponta para a etapa (`RateioNota.etapaId`)
  e o avanço é ponderado pelo orçamento (`avancoPonderado`).
- **Pré-requisitos:** renomear e reordenar etapa (PR 2). Decidir se o custo rateia só na folha.
- **Esforço:** G. `Etapa.paiId`, rollup de datas, avanço e orçamento, e revisão de todas as telas que
  listam etapas (orçamento, rateio, alertas, cronograma).
- **Prioridade:** Média. Já está no backlog médio do plano
  ([auditoria de fluxos](../../assistente-e-fluxos.md#5-auditoria-de-fluxos--mercado)).
- **Encaixe:** Onda 2, adições. Base para Semanal, importação e versões.

### Predecessoras e CPM

- **No Cofield:** TI/II/TT/IT com lag; dois modos para várias predecessoras; caminho crítico; início
  cravado; "paredes" que param o recálculo; ciclos recusados.
  [§4.1, "Predecessoras e CPM"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** nada além das datas soltas por etapa.
- **Pré-requisitos:** [EAP](#eap-em-árvore) (as dependências ficam entre folhas); de preferência
  [dias úteis](#calendário-em-dias-úteis).
- **Esforço:** G.
- **Prioridade:** Média. Sem dependências, mudar uma data não move as seguintes e não há tendência de
  término.
- **Encaixe:** Onda 2, adições (já no backlog médio do plano).

### Importação e exportação do cronograma

- **No Cofield:** importa `.mpp` (convertido no servidor), XML MSPDI e planilha com mapeamento de
  colunas, política de datas e erros por linha; exporta `.xlsx` no mesmo formato, `.xml` do MS Project,
  PDF de uma página e A3. [§4.1, "Importação"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** o PR 2 exporta CSV e imprime. `fast-xml-parser` já é dependência (usado no XML da
  NF-e). Há um importador de planilha para migração (`/importar`, `src/services/importacao.ts`).
- **Pré-requisitos:** [EAP](#eap-em-árvore) e [predecessoras](#predecessoras-e-cpm); sem elas a
  importação perde a estrutura do arquivo.
- **Esforço:** G (`.mpp` exige conversor no servidor; começar por XML MSPDI e planilha).
- **Prioridade:** Média. Tira a barreira de entrada de quem já tem o cronograma no Project.
- **Encaixe:** Onda 2, adições, depois da EAP.

### IA no cronograma, no orçamento e no histograma

- **No Cofield:** gera a estrutura do cronograma (fases, repetições, vínculos) por chat + formulário com
  prévia; monta a árvore do orçamento ("estrutura, não preço"); estima quantitativos do histograma.
  Nada grava sem confirmação. [§6](analise-plataforma.md#6-ia-na-plataforma)
- **O que já temos:** Gemini integrado (`src/services/gemini.ts`, `leitor-gemini.ts`) e o mesmo princípio
  de conferência antes de gravar; etapas padrão na criação da obra (`ETAPAS_PADRAO` em
  `src/schemas/obra.ts`).
- **Pré-requisitos:** para o cronograma, [EAP](#eap-em-árvore); para o histograma, o
  [histograma](#histograma-de-mão-de-obra). Sugerir datas e durações por tipo de obra já é possível com
  o modelo atual.
- **Esforço:** M por frente.
- **Prioridade:** Média.
- **Encaixe:** Onda 3, IA.

---

## Baixa

### Metas mensais da curva S

- **No Cofield:** crava a fatia planejada de cada mês; mês passado só se edita se a meta não foi cravada
  dentro dele. [§4.1, "Acompanhamento"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** curva S mensal (`curvaS` em `src/services/cronograma.ts`); linha de base do PR 2.
- **Pré-requisitos:** PR 2.
- **Esforço:** P.
- **Prioridade:** Baixa. A linha de base cobre o principal.
- **Encaixe:** backlog do cronograma.

### Desafio

- **No Cofield:** segunda referência, agressiva, comparada em paralelo à linha de base em barras, curva
  S e indicadores. [§4.1, "Linha de base, desafio e variância"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** a linha de base do PR 2.
- **Pré-requisitos:** [troca e histórico da linha de base](#troca-e-histórico-da-linha-de-base) (o
  desafio é só outra referência com papel especial).
- **Esforço:** P.
- **Prioridade:** Baixa.
- **Encaixe:** backlog do cronograma.

### Replanejar obra

- **No Cofield:** assistente que reposiciona o cronograma a partir de uma data de corte, com regras para
  tarefas não iniciadas, em andamento e com progresso; resultado vai para o rascunho.
  [§4.1, "Replanejar obra"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** edição de todas as datas num diálogo (`datas-dialog.tsx`); a linha de base do
  PR 2 preserva o plano original.
- **Pré-requisitos:** [predecessoras e CPM](#predecessoras-e-cpm) (sem elas, "empurrar" é só somar dias);
  de preferência [versões](#versões-e-rascunho-do-cronograma).
- **Esforço:** M.
- **Prioridade:** Baixa. Com poucas etapas por obra, o diálogo atual resolve.
- **Encaixe:** depois de predecessoras e CPM.

### Versões e rascunho do cronograma

- **No Cofield:** edições em rascunho local até salvar; cada salvamento é uma versão com nota;
  restaurar carrega no rascunho; bloqueio de cronograma.
  [§4.1, "Rascunho, versões e histórico"](analise-plataforma.md#41-planejamento--cronograma-gantt)
- **O que já temos:** o log de auditoria registra quem alterou as datas (`cronograma.datas`), mas não
  guarda o antes e o depois.
- **Pré-requisitos:** [EAP](#eap-em-árvore), para valer a pena.
- **Esforço:** G.
- **Prioridade:** Baixa. A linha de base cobre a necessidade de "não reescrever a história".
- **Encaixe:** depois da EAP.

### Vinculação orçamento ↔ etapas por itens

- **No Cofield:** itens de orçamento cravado ligados a tarefas com pesos (60/40), entre cronogramas
  diferentes; Custos só abre com 100% vinculado; base do % custo e do % receita.
  [§4.8](analise-plataforma.md#48-orçamento-e-vinculação)
- **O que já temos:** o orçamento já é por etapa e o realizado já cai na etapa pelo rateio, então a
  ligação custo ↔ cronograma existe sem esse passo.
- **Pré-requisitos:** orçamento com itens (backlog médio do plano: itens, composições, BDI); EAP.
- **Esforço:** G.
- **Prioridade:** Baixa. Para o nosso porte, o orçamento por etapa já faz o papel. Não repetir o
  "100% vinculado para abrir" deles, que é a causa dos painéis vazios.
- **Encaixe:** depois de orçamento com itens.

### Escadinha e linha de balanço

- **No Cofield:** leituras somente leitura de ritmo em obras repetitivas, a partir dos campos Grupo,
  Local e Pacote do cronograma. [§4.3](analise-plataforma.md#43-planejamento--escadinha-e-linha-de-balanço)
- **O que já temos:** nada. O plano diz para **não construir** linha de balanço
  ([plano](../../plano-evolucao.md#o-que-não-construir-fora-do-perfil-do-produto)).
- **Pré-requisitos:** [EAP](#eap-em-árvore) e um campo de grupo (pavimento, casa, lote) na etapa.
- **Esforço:** M.
- **Prioridade:** Baixa. **Rever o "não construir"**: as obras atuais são lotes da própria empresa, que
  repetem as mesmas etapas casa a casa. Uma escadinha **entre obras** (etapa × lote) pode mostrar o
  ritmo sem nenhum campo novo. Vale testar como relatório antes de mudar o plano.
- **Encaixe:** decisão a registrar no plano; se aprovada, backlog do cronograma.

### Qualidade e FVS

- **No Cofield:** ainda em construção; já há configuração (lista de verificações, motivos de "não
  aplicável") e notificações de FVS e não conformidade.
  [§4.12](analise-plataforma.md#412-qualidade-e-diário-em-construção)
- **O que já temos:** RDO com fotos; etapas.
- **Pré-requisitos:** nenhum técnico.
- **Esforço:** G.
- **Prioridade:** Baixa. Diferencial de qualidade, não de controle de custo.
- **Encaixe:** Onda 3, checklists/FVS (já previsto).

### Integração ERP e API

- **No Cofield:** Sienge e Mega, configurados por projeto: importar orçamentos e exportar a estrutura.
  [§4.10](analise-plataforma.md#410-integração-erp)
- **O que já temos:** só a Sefaz. Somos nós que fazemos o papel de ERP financeiro.
- **Pré-requisitos:** exportação CSV (PR 2 no cronograma; backlog baixo para o resto); API somente
  leitura com token.
- **Esforço:** G.
- **Prioridade:** Baixa.
- **Encaixe:** backlog baixo do plano (exportação CSV/PDF), depois API para BI.

### RBAC customizável

- **No Cofield:** perfis do sistema (Administrador, Membro, Somente leitura) e perfis próprios, com
  concessões − negações, no workspace e no projeto. [§5.2](analise-plataforma.md#52-perfis-de-acesso-rbac)
- **O que já temos:** três papéis fixos e acesso por obra (`src/services/acesso.ts`, `Usuario.todasObras`,
  `UsuarioObra`); `acaoDeEscrita` concentra a checagem de papel.
- **Pré-requisitos:** nenhum técnico; pedido real de um papel que os três não cobrem.
- **Esforço:** M.
- **Prioridade:** Baixa.
- **Encaixe:** plataforma (item 2.5), quando houver demanda.

---

## Decisão de produto

### Multiempresa e planos

- **No Cofield:** workspaces isolados com troca rápida; 4 planos cumulativos por obra; trial; fatura por
  obra ou agregada; NFS-e; bloqueio por inadimplência; módulos ligados por projeto.
  [§2](analise-plataforma.md#2-arquitetura-e-modelo-mental), [§3](analise-plataforma.md#3-planos-e-preços)
- **O que já temos:** uma empresa só (`Empresa` com id fixo `principal`).
- **Pré-requisitos:** decidir vender o app para outras empresas. Isolamento por `empresaId` em todas as
  consultas, revisão de segurança, cobrança.
- **Esforço:** G.
- **Prioridade:** decisão de produto, não lacuna técnica.
- **Encaixe:** fora do plano atual.
