# Cofield

SaaS brasileiro de gestão de obras ([cofield.com.br](https://cofield.com.br)) que liga escritório e
canteiro. O **cronograma é a espinha dorsal**: Last Planner semanal, restrições, histograma,
suprimentos, vinculação de orçamento, custos e quase todos os indicadores derivam dele. Tem IA para
gerar cronograma, orçamento e quantitativos, sempre com revisão antes de gravar.

## Ficha

| | |
|---|---|
| **O que é** | Planejamento e controle de obra com foco em Lean Construction (Last Planner), vendido por módulo e por obra |
| **Público** | Construtoras, incorporadoras, engenheiros, consultores de planejamento (multicliente) e gerenciadoras |
| **Módulos** | Planejamento (cronograma, escadinha, linha de balanço, medições), Semanal, Restrições, Histograma, Suprimentos, Orçamento, Custos, Integração (Sienge e Mega), Dashboard. Diário e Qualidade "em breve" |
| **Preço** | Por obra por mês, em 4 planos cumulativos: Lite R$ 349 · Plus R$ 799 · Pro R$ 999 · Enterprise R$ 1.299. Trial no primeiro projeto |
| **Ponto forte** | Rigor de método: PPC binário, motivo de atraso obrigatório, linha de base com snapshot de pesos, tendência auditável, fórmulas de custo editáveis |
| **Ponto fraco** | Quase nada funciona antes de existir cronograma salvo com linha de base; Custos exige orçamento 100% vinculado. Sem app mobile e sem diário |
| **Diferença para nós** | Eles nasceram do **planejamento**, com custo como extra (Custos só no Enterprise). Nós nascemos do **financeiro** (lançamentos, rateio, contas, NF-e), com um planejamento mais simples |

## Fontes e data

| Fonte | Data | Grau de certeza |
|---|---|---|
| Navegação autenticada numa conta de teste (projeto *Casa 2*, vazio, plano Enterprise em trial). Nada foi criado nem alterado | 21–22/10/2026 | **confirmado** (telas, menus, configurações, preços) |
| Central de tutoriais (`cofield.com.br/guides`, ~20 guias) e site público | 21–22/10/2026 | **divulgado** (lógica interna dos fluxos: o projeto estava vazio, então nenhum fluxo rodou de ponta a ponta) |
| Capturas de tela do cadastro, onboarding e criação de projeto, e posts de divulgação no LinkedIn (análise anterior, PR #51, substituída por esta pasta) | 22/10/2026 | **confirmado** (capturas) e **divulgado** (posts) |

Limites da análise: ver [§10 da análise](analise-plataforma.md#10-limitações-desta-análise). Sem
marca explícita, o que está nesta pasta sobre o Cofield vale como **divulgado** (vem dos guias
oficiais) e o que está sobre o nosso app foi conferido no código.

## Arquivos

| Arquivo | O que tem |
|---|---|
| [`analise-plataforma.md`](analise-plataforma.md) | Análise completa, na íntegra (fonte primária): arquitetura, planos, cada módulo, indicadores, IA, visão de PM |
| [`comparativo.md`](comparativo.md) | Funcionalidades comuns (como funciona lá e aqui, com o arquivo do nosso código, e a decisão), exclusivas de cada lado e observações de UX |
| [`backlog.md`](backlog.md) | O que não entra agora, com ficha por item e prioridade |

O que entra agora está dividido em dois PRs, descritos no [comparativo](comparativo.md#o-que-entra-agora):
**PR 2** (cronograma) e **PR 3** (orçamento × custos, alertas e dashboard).
