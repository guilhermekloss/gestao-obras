# Cofield × Gestão de Obras: comparativo

O que os dois produtos têm em comum, o que só um deles tem e o que decidimos fazer. "Lá" é o Cofield,
descrito na [análise da plataforma](analise-plataforma.md); "aqui" é o nosso app, conferido no código
em 22/10/2026 (`main` em `f6db869`). Grau de certeza das informações sobre o Cofield: ver a
[ficha](README.md#fontes-e-data).

Decisões:
- **agora · PR 2**: entra no PR de cronograma.
- **agora · PR 3**: entra no PR de orçamento × custos, alertas e dashboard.
- **backlog**: fica para depois, com ficha em [`backlog.md`](backlog.md).

## O que entra agora

| PR | Escopo |
|---|---|
| **PR 2 · Cronograma** | Status **Atenção** entre "Em dia" e "Atrasada"; **IDP** (realizado ÷ previsto); **desvio** em dias e em pontos percentuais por etapa; **linha de base** (uma foto do plano para comparar); **renomear e reordenar etapa**; **editar medição**; **exportar CSV e imprimir** o cronograma |
| **PR 3 · Orçamento × custos** | **Valor agregado** (orçamento × avanço físico), **IDC** (valor agregado ÷ gasto), **tendência de custo** (quanto a obra vai custar no fim) e **desembolso** previsto × realizado; alertas de **etapa atrasada** e de **tendência de estouro do orçamento**; **dashboard com filtro por obra** |

---

## 1. Funcionalidades comuns

### 1.1 Cronograma e Gantt

| | |
|---|---|
| **Lá** | Cronograma em árvore (pacotes e folhas), vários por obra, com predecessoras e CPM, calendário em dias úteis, rascunho e versões, importação de `.mpp`/XML/planilha e exportação. Grade que funciona como planilha. [§4.1](analise-plataforma.md#41-planejamento--cronograma-gantt) |
| **Aqui** | Um cronograma por obra, com as etapas da obra (um nível) e datas de início e fim previstas, editadas todas de uma vez num diálogo. Gantt em barras mensais com a cor da situação e a linha de hoje. `src/app/(app)/cronograma/page.tsx`, `gantt.tsx`, `datas-dialog.tsx`, `actions.ts` (`salvarDatasEtapas`); regra em `src/services/cronograma.ts` (`escalaGantt`, `posicaoNoGantt`); modelo `Etapa` em `prisma/schema.prisma` (`inicioPrevisto`, `fimPrevisto`, `ordem`) |
| **Lá tem a mais** | EAP em árvore, predecessoras/CPM, caminho crítico, calendário e dias úteis, vários cronogramas por obra, rascunho/versões, importar e exportar, linha de base e desafio, replanejar obra, marcadores de data, colunas personalizadas |
| **Aqui tem a mais** | Cronograma já nasce das etapas da obra que recebem custo (rateio por etapa); o CAMPO vê o Gantt sem nenhum valor em R$ |
| **Decisão** | **agora · PR 2**: linha de base, renomear e reordenar etapa (hoje só dá para criar e excluir, em `src/app/(app)/obras/actions.ts`), exportar CSV e imprimir. **backlog**: [EAP](backlog.md#eap-em-árvore), [predecessoras/CPM](backlog.md#predecessoras-e-cpm), [dias úteis](backlog.md#calendário-em-dias-úteis), [importar/exportar MS Project](backlog.md#importação-e-exportação-do-cronograma), [versões](backlog.md#versões-e-rascunho-do-cronograma), [histórico de linhas de base](backlog.md#troca-e-histórico-da-linha-de-base), [replanejar](backlog.md#replanejar-obra) |

### 1.2 Medições e avanço físico

| | |
|---|---|
| **Lá** | Medição é uma foto datada do avanço (data efetiva ≠ data de digitação); medição retroativa recalcula a série; aceita fotos; o Semanal grava medição. Progresso só entra por medição. [§4.2](analise-plataforma.md#42-planejamento--medições) |
| **Aqui** | Mesmo princípio: `Medicao` guarda o avanço **acumulado** da etapa com data; a série é validada para não regredir nem passar de uma medição posterior, e não aceita data futura (`validarAvancoNaSerie` em `src/services/obra.ts`). Aba **Avanço** do cronograma (`src/app/(app)/cronograma/avanco.tsx`, `medicao-dialog.tsx`); `criarMedicao` aceita qualquer papel, `excluirMedicao` só ADMIN e ESCRITORIO (`cronograma/actions.ts`) |
| **Lá tem a mais** | Editar medição, fotos como evidência, tela com acumulado × esperado × apontado por tarefa, medição a partir do Semanal |
| **Aqui tem a mais** | O CAMPO lança o avanço pelo celular; cada lançamento vai para o log de auditoria (`anotarAtividade`) e para a página do usuário |
| **Decisão** | **agora · PR 2**: editar medição (hoje só excluir e relançar). **backlog**: medição a partir do [Semanal](backlog.md#semanal-ppc-e-motivos-de-atraso) |

### 1.3 Curva S

| | |
|---|---|
| **Lá** | Previsto e realizado acumulados mais o avanço do período, contra a linha de base; base em % físico, % custo ou % receita; metas mensais travadas. [§4.11](analise-plataforma.md#411-dashboard-e-indicadores) |
| **Aqui** | Curva S mensal previsto × realizado por obra e consolidada. O previsto é linear entre início e fim de cada etapa; as etapas pesam pelo orçamento (`avancoPonderado` em `src/services/obra.ts`, `curvaS` e `agregarCurvasS` em `src/services/cronograma.ts`). Tela em `cronograma/curva-s-chart.tsx` e widget em `src/app/(app)/dashboard/widgets/curva-s.tsx` |
| **Lá tem a mais** | Previsto contra a linha de base (o nosso usa as datas atuais, então replanejar "apaga" o atraso), metas mensais, escolha da base do percentual |
| **Aqui tem a mais** | Já é ponderada pelo orçamento (equivale ao "% custo" deles) sem exigir vinculação item a item |
| **Decisão** | **agora · PR 2**: linha de base também na curva S. **backlog**: [metas mensais](backlog.md#metas-mensais-da-curva-s), [desafio](backlog.md#desafio) |

### 1.4 Status por etapa

| | |
|---|---|
| **Lá** | Farol e status por tarefa: Concluído, Atrasado, Alerta, Em andamento, Em dia; % previsto na data |
| **Aqui** | `situacaoEtapa` em `src/services/cronograma.ts`: Não iniciada, Em dia, Atrasada (fim passou sem 100% ou previsto − realizado > 10 p.p.), Concluída, Sem datas. Cores em `cronograma/situacao.tsx` |
| **Lá tem a mais** | Faixa intermediária (Alerta) antes de virar atraso |
| **Aqui tem a mais** | Estado "Sem datas" explícito |
| **Decisão** | **agora · PR 2**: status **Atenção**, desvio em dias e em p.p. e IDP por etapa e por obra |

### 1.5 Orçamento

| | |
|---|---|
| **Lá** | Orçamentos de custo e de receita em árvore, criados à mão, por planilha, pelo ERP ou por IA; rascunho × cravado; vinculação item ↔ tarefa com pesos. [§4.8](analise-plataforma.md#48-orçamento-e-vinculação) |
| **Aqui** | Um valor de orçamento por etapa (`Etapa.orcamentoCents`), editado em `src/app/(app)/orcamento/orcamento-form.tsx`; a tela mostra previsto × realizado e o consumo com faixas OK / Atenção (≥ 90%) / Estouro (`faixaConsumo` em `src/services/analises.ts`). Curva ABC de insumos em `src/app/(app)/orcamento/abc/` |
| **Lá tem a mais** | Itens com quantidade e preço, orçamento de receita, rascunho e cravado, importação, IA, vinculação com pesos |
| **Aqui tem a mais** | Realizado vem direto dos lançamentos rateados por etapa, sem passo de vinculação; curva ABC dos insumos comprados |
| **Decisão** | **agora · PR 3**: valor agregado, tendência e desembolso sobre o orçamento por etapa. **backlog**: [vinculação por itens](backlog.md#vinculação-orçamento--etapas-por-itens), [IA no orçamento](backlog.md#ia-no-cronograma-no-orçamento-e-no-histograma) |

### 1.6 Custos realizados

| | |
|---|---|
| **Lá** | Módulo Custos (só Enterprise, exige orçamento 100% vinculado): realizado, comprometido, estoque, saldo, tendência com fórmula editável, correção por CUB, trava de linha com motivo de estouro. [§4.9](analise-plataforma.md#49-custos) |
| **Aqui** | O realizado é a soma dos lançamentos rateados por obra e etapa: `realizadoPorObra`, `realizadoPorEtapa`, `realizadoPorMes` em `src/services/custos.ts`, sobre `RateioNota` (fração em bp por obra, etapa opcional). Lançamentos em `src/app/(app)/notas/` |
| **Lá tem a mais** | Comprometido, estoque, fórmulas, tendência, CUB, travas com motivo, importação de planilha de custos |
| **Aqui tem a mais** | O dado de origem: cada custo nasce de um documento (NF, recibo, folha, guia) com itens, parcelas e anexo, lido por foto/PDF/XML ou capturado na Sefaz. Lá o realizado é digitado, importado de planilha ou do ERP |
| **Decisão** | **agora · PR 3**: IDC, tendência de custo e desembolso previsto × realizado. **backlog**: [comprometido, fórmulas, CUB e trava](backlog.md#custos-com-comprometido-fórmulas-cub-e-trava-com-motivo) |

### 1.7 Dashboard e indicadores

| | |
|---|---|
| **Lá** | Visão geral mais um painel por módulo, widgets configuráveis e salvos no servidor; base do percentual, referência e data de referência mudam tudo; IDP, IDC, IRR, PPC, término e tendência auditável. [§4.11](analise-plataforma.md#411-dashboard-e-indicadores) |
| **Aqui** | Dashboard fixo em `src/app/(app)/dashboard/page.tsx`: "Pede ação hoje" (a vencer em 7 dias, notas com divergência, alertas) e "Como estão as obras" (curva S consolidada, avanço físico por obra, top 5 da curva ABC, gasto mensal por obra, orçado × realizado). Sem filtro por obra: tudo é consolidado |
| **Lá tem a mais** | Painéis por módulo, widgets configuráveis, IDP, IDC, tendência de término, PDF |
| **Aqui tem a mais** | Bloco de pendências financeiras (contas a vencer, notas divergentes) no topo |
| **Decisão** | **agora · PR 3**: filtro por obra e os indicadores novos (IDP vem do PR 2; IDC, tendência e desembolso do PR 3). Widgets configuráveis ficam fora |

### 1.8 Alertas

| | |
|---|---|
| **Lá** | Mensagens nos widgets dizendo o que falta; notificações in-app e por e-mail (12 tipos). [§5.3](analise-plataforma.md#53-notificações-e-mail-além-do-in-app) |
| **Aqui** | Alertas calculados na hora em `src/services/analises.ts` (`carregarAlertas`): orçamento estourado ou em atenção por etapa, parcela vencida, nota divergente e, para o ADMIN, certificado e falhas da captura Sefaz e NF-e recebida. Lista no dashboard e em `src/app/(app)/dashboard/alertas/` |
| **Lá tem a mais** | Alertas de prazo (semana aberta, restrição vencendo, suprimento atrasado), envio por e-mail |
| **Aqui tem a mais** | Alertas financeiros e fiscais (parcela vencida, divergência de nota, certificado A1) |
| **Decisão** | **agora · PR 3**: alerta de etapa atrasada e de tendência de estouro do orçamento. **backlog**: [notificações por e-mail e in-app](backlog.md#notificações-por-e-mail-e-in-app) |

### 1.9 Pessoas, convites e permissão por obra

| | |
|---|---|
| **Lá** | Convite por e-mail com perfil e projetos ("todos" ou "selecionados"); login por Google, Microsoft ou código por e-mail. [§5.1](analise-plataforma.md#51-pessoas) |
| **Aqui** | Convite por link de uso único com papel, obras e validade (`Convite` no schema, `src/services/convite.ts`, `src/app/(app)/usuarios/`); três papéis fixos ADMIN, ESCRITORIO, CAMPO; o CAMPO pode ficar limitado a obras (`Usuario.todasObras`, `UsuarioObra`, `src/services/acesso.ts`). Login por e-mail e senha com bloqueio após tentativas erradas (`src/services/protecao-login.ts`) |
| **Lá tem a mais** | Perfis customizáveis (concessões − negações), perfis por projeto, login social e sem senha |
| **Aqui tem a mais** | Link de convite que dá para mandar por WhatsApp; página por usuário com o que ele produziu; aba Equipe na obra |
| **Decisão** | **backlog**: [RBAC customizável](backlog.md#rbac-customizável) |

### 1.10 Tutoriais, tours e assistente

| | |
|---|---|
| **Lá** | Central com ~20 guias, tours contextuais por tela, estados vazios que dizem o que falta. [§5.4](analise-plataforma.md#54-outros) |
| **Aqui** | Assistente de navegação: pop-up de boas-vindas por papel, tour guiado, central de ajuda com um guia por fluxo e perguntas à IA. `src/services/assistente/` (`guias.ts`, `tours.ts`, `ia.ts`), `src/components/assistente/`; ver [`assistente-e-fluxos.md`](../../assistente-e-fluxos.md) |
| **Lá tem a mais** | Guias longos de método (LPS, indicadores) |
| **Aqui tem a mais** | Perguntas em linguagem natural respondidas pela IA com base nos guias, com link para a tela |
| **Decisão** | Mantém. Cada PR novo atualiza o guia da tela que mudou (regra do `assistente-e-fluxos.md`) |

### 1.11 IA

| | |
|---|---|
| **Lá** | Gera cronograma, orçamento e quantitativos do histograma, sempre com prévia e confirmação. [§6](analise-plataforma.md#6-ia-na-plataforma) |
| **Aqui** | IA na leitura de documento: **Analisar com IA** (Gemini) relê a nota quando o índice de acerto é baixo (`src/services/leitor-gemini.ts`), e no assistente (`src/services/assistente/ia.ts`). O mesmo princípio: a conferência só grava depois da confirmação. Ver [`leitura-nota-fiscal.md`](../../leitura-nota-fiscal.md) |
| **Lá tem a mais** | IA no planejamento (cronograma, orçamento, histograma) |
| **Aqui tem a mais** | IA na entrada de custos, que é onde está o trabalho repetitivo do nosso usuário |
| **Decisão** | **backlog**: [IA no cronograma, no orçamento e no histograma](backlog.md#ia-no-cronograma-no-orçamento-e-no-histograma) |

---

## 2. Só no Cofield

Todas ficam no backlog. Detalhes, pré-requisitos e prioridade em [`backlog.md`](backlog.md).

| Funcionalidade | Resumo | Ficha |
|---|---|---|
| **Semanal (Last Planner)** | Plano da semana travado, PPC binário, motivo de atraso obrigatório, link público para o responsável | [Semanal](backlog.md#semanal-ppc-e-motivos-de-atraso) |
| **Restrições** | Planos de ação ligados a tarefas, criticidade, IRR, responsável externo por link | [Restrições](backlog.md#restrições-com-irr-e-responsável-externo) |
| **Histograma** | Efetivo previsto = quantitativo ÷ produtividade ÷ duração; curva de carga diária | [Histograma](backlog.md#histograma-de-mão-de-obra) |
| **Suprimentos** | Etapas de compra com lead time contado de trás para frente a partir do início da tarefa | [Suprimentos](backlog.md#suprimentos-com-lead-time-retroativo) |
| **Vinculação de orçamento** | Itens do orçamento ligados a tarefas com pesos; base de % custo e % receita | [Vinculação](backlog.md#vinculação-orçamento--etapas-por-itens) |
| **Integração ERP** | Sienge e Mega: importar orçamento, exportar estrutura | [ERP/API](backlog.md#integração-erp-e-api) |
| **Escadinha e linha de balanço** | Leituras de ritmo para obras repetitivas (pavimentos, blocos) | [Escadinha](backlog.md#escadinha-e-linha-de-balanço) |
| **Qualidade / FVS** | Em construção lá: FVS ligada a tarefa e não conformidades | [Qualidade](backlog.md#qualidade-e-fvs) |
| **Notificações por e-mail** | 12 tipos, de semana aberta a NC atrasada | [Notificações](backlog.md#notificações-por-e-mail-e-in-app) |
| **Colaboração externa por link** | Responsável sem conta atualiza Semanal e Restrições por página pública | Parte de [Semanal](backlog.md#semanal-ppc-e-motivos-de-atraso) e [Restrições](backlog.md#restrições-com-irr-e-responsável-externo) |
| **Planos e faturamento** | 4 planos por obra, fatura por obra ou agregada, NFS-e, bloqueio por inadimplência | [Multiempresa e planos](backlog.md#multiempresa-e-planos) |
| **RBAC customizável** | Perfis próprios no workspace e no projeto | [RBAC](backlog.md#rbac-customizável) |
| **Multi-workspace** | Várias empresas isoladas, troca rápida | [Multiempresa e planos](backlog.md#multiempresa-e-planos) |

## 3. Só aqui

Conferido no código. Nenhum destes aparece na análise do Cofield.

| Funcionalidade | Onde está |
|---|---|
| **Lançamentos com rateio** entre obras e etapas, por tipo de documento (NF, recibo, folha, guia, outro) | `src/app/(app)/notas/`, `src/services/rateio.ts`, `src/services/lancamento.ts`; `NotaFiscal`, `RateioNota` e `TipoDocumento` no schema |
| **Contas a pagar e fluxo mensal**: parcelas, baixa com data de pagamento, visão por vencimento | `src/app/(app)/contas/` (+ `fluxo/`), `src/services/parcelas.ts`, `src/services/financeiro.ts` |
| **Leitura de nota por foto, PDF ou XML**, com conferência antes de gravar e releitura com IA | `src/app/(app)/notas/nova/`, `notas/importar-xml/`, `src/services/leitor-nativo/`, `nfe-xml.ts`, `leitura-documento.ts`, `leitor-gemini.ts`; [`leitura-nota-fiscal.md`](../../leitura-nota-fiscal.md) |
| **Captura automática na Sefaz** (distribuição DF-e com certificado A1, ciência da operação) | `src/services/sefaz/`, `src/app/(app)/sefaz/`; `DocumentoSefaz`, `CursorSefaz` no schema; [`captura-sefaz.md`](../../captura-sefaz.md) |
| **Catálogo de materiais** com vínculo automático aos itens das notas e **curva ABC** de insumos | `src/app/(app)/materiais/`, `src/services/materiais.ts`, `materiais-db.ts`; `Material`, `MaterialApelido` no schema; ABC em `src/app/(app)/orcamento/abc/` (`curvaAbc` em `analises.ts`) |
| **Índice de dependência de fornecedor** (concentração, exclusividade, recência, alcance) | `src/services/dependencia.ts`, `src/app/(app)/fornecedores/` |
| **RDO completo**: clima por turno, condição de trabalho, efetivo, equipamentos, fotos, impressão. Lá o Diário é "em breve" | `src/app/(app)/diario/` (`[id]/botao-imprimir.tsx`), `src/services/rdo.ts`; `DiarioObra`, `Foto` no schema |
| **Papel CAMPO sem valores**, bloqueado no servidor, e limitado a obras | `veFinanceiro` em `src/services/acesso.ts`; o cronograma entrega só pesos em %, nunca R$ (`cronograma/dados.ts`) |
| **Log de auditoria** por usuário e por obra | `Atividade` no schema, `src/services/atividade.ts`, `src/lib/atividade.ts`, `acaoDeEscrita` em `src/lib/acao.ts`; página `/usuarios/<id>` |

Leitura: o nosso posicionamento é **"controle de custo e caixa da obra, com o planejamento que o campo
usa"**. O do Cofield é **"planejamento lean, com custo como extra"**. O PR 2 e o PR 3 aproximam o nosso
planejamento do deles nos indicadores que a diretoria lê (IDP, IDC, tendência) sem copiar a cadeia de
dependências que deixa os painéis deles vazios até o setup terminar.

## 4. Observações de UX (para não repetir)

Das capturas de tela do cadastro e da criação de projeto (**confirmado**) e da análise da plataforma.

- **Recomendação de plano forçada.** Com só Planejamento e Semanal marcados, o assistente recomenda o
  Enterprise. Confunde quem está testando.
- **Texto que promete o que não existe.** O Lite fala em "diário", o Plus em "qualidade" e o Pro em
  "custos", mas Diário e Qualidade estão "em breve" e Custos só existe no Enterprise.
- **Erros de texto.** "1 módulos incluídos" e texto repetido na etapa "Pessoas do projeto".
- **Preço escondido.** "Total mensal R$ 0,00" riscado no resumo, sem dizer quanto custa depois do teste.
- **Celular quebrado.** Na Visão geral, o menu ocupa a tela e o conteúdo vaza para a direita.
- **Assistentes demais antes do valor.** Onboarding de 9 passos mais criação de projeto em 5 antes de
  ver qualquer dado. E, depois disso, todos os painéis vazios até existir cronograma com linha de base
  ([§8.2](analise-plataforma.md#82-fraquezas-e-riscos)).
- **Estado vazio sem o atalho certo.** O cronograma vazio só oferece "Novo cronograma"; a IA e a
  importação, que encurtam o caminho, não aparecem ali.
- **O que vale copiar:** widget nunca fica vazio em silêncio (diz o que falta e leva até lá); ações
  irreversíveis pedem confirmação explícita; restaurar versão vai para o rascunho, nunca direto para o
  servidor.

Para nós: cada indicador novo do PR 2 e do PR 3 precisa de estado vazio que diga o que falta (ex.:
"defina as datas das etapas" ou "marque uma linha de base") e funcionar no celular desde o primeiro
commit.
