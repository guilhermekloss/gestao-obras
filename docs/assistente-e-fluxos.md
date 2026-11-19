# Assistente de navegação, fluxos do sistema e auditoria de mercado

Este documento cobre quatro coisas: o **assistente** (boas-vindas, tour, guias e perguntas à IA),
sua **arquitetura**, como **mantê-lo** em dia quando uma tela muda, e o **mapa dos fluxos de
negócio** com a auditoria contra o mercado (out/2026). A lista de prioridades entra no plano em
[`plano-evolucao.md`](plano-evolucao.md#5-auditoria-de-fluxos-out2026).

---

## 1. O que é o assistente

Ajuda embutida no app para quem acabou de entrar: mostra onde fica cada coisa e responde dúvidas
de uso. **Não é** um chat sobre os números das obras.

| Peça | Como funciona |
|---|---|
| **Pop-up de boas-vindas** | Aparece no primeiro login. O campo `Usuario.assistenteVistoEm` nulo significa "ainda vai ver"; a action `marcarAssistenteVisto` (`src/app/(app)/assistente/actions.ts`) grava a data ao fechar, fazer o tour ou abrir os guias. |
| **Botão fixo** | Presente em todas as telas do app (`data-assistente="botao"`); reabre o assistente a qualquer momento. |
| **Tour guiado** | Passos que destacam elementos reais da tela. Sem biblioteca externa. Âncoras no DOM: `data-assistente="menu:/rota"` (itens do menu), `data-assistente="menu:mais"` (item "Mais" da barra inferior no celular), `data-assistente="conta"` (botão da conta no cabeçalho, em `src/app/(app)/layout.tsx`), `data-assistente="botao"` e ids de página. O passo guarda um seletor CSS em `alvo` (ex.: `[data-assistente="botao"]`); sem `alvo`, vira um cartão centralizado. Alvos ocultos (ex.: menu lateral no celular) são pulados. |
| **Central de ajuda** | Guias curtos por assunto, escritos por papel. Abre em folha lateral (desktop) ou de baixo (celular). |
| **Perguntas à IA** | Campo de pergunta livre respondido pelo Gemini (`src/services/gemini.ts`, modelo em `GEMINI_MODELO_ASSISTENTE`). |

### Regras da IA

- **Só aparece** se `GEMINI_PROJETO` ou `GEMINI_API_KEY` estiver configurada; sem isso o assistente
  funciona normalmente, só sem o campo de pergunta.
- **Responde apenas a partir dos guias do papel** do usuário. Não recebe nem consulta dados de obras,
  notas, parcelas ou valores.
- **Telas sugeridas** na resposta são filtradas pelo menu do papel — o CAMPO nunca recebe link para
  `/contas`, `/notas` etc.
- **Limite por usuário**, em memória (reinicia com o processo; suficiente para frear abuso, não é cota
  contábil).
- **Log sem o texto da pergunta** — registra só que houve uso, o papel e o resultado.

### Texto por papel

| Papel | Vê no assistente |
|---|---|
| ADMIN | Todos os guias, inclusive Usuários e convites |
| ESCRITORIO | Guias financeiros e de planejamento; sem Usuários |
| CAMPO | Obras, Diário e Cronograma. **Nenhum guia, tour ou resposta menciona valores, notas ou contas** |

---

## 2. Arquitetura

### Mapa de arquivos

| Caminho | Papel |
|---|---|
| `src/services/assistente/tipos.ts` | Tipos `Guia`, `PassoTour`, `Tour`, `MensagemChat`, `TelaSugerida` |
| `src/services/assistente/guias.ts` | Conteúdo dos guias (`GUIAS`): papéis, link, rotas em que é o "Nesta tela", para que serve, passo a passo, regras, dicas. Fonte única: central de ajuda, tour e contexto da IA leem daqui |
| `src/services/assistente/tours.ts` | Tours (`TOURS`): papéis, rotas (vazio = boas-vindas) e passos (`alvo`, título, texto) |
| `src/services/assistente/index.ts` | Funções puras: `guiasPara`, `guiaDaRota`, `tourDeBoasVindas`, `tourDaTela`, `buscarGuias`; usa `naRota` de `src/components/nav-itens` |
| `src/services/assistente/ia.ts` | Monta o contexto (só guias do papel), chama o Gemini, filtra telas sugeridas, limite por usuário |
| `src/services/gemini.ts` | Cliente Gemini (`clienteGemini`, `analiseIaDisponivel`) |
| `src/components/assistente/**` | `assistente.tsx` (botão fixo, pop-up, tour, central de ajuda) e demais componentes do assistente |
| `src/app/(app)/assistente/actions.ts` | Server actions: `marcarAssistenteVisto` (sem log de auditoria: abrir ou dispensar a ajuda não é ação de negócio) e `perguntarAssistente(pergunta, historico, rota)` |

### Fluxo de dados

```
login → layout (app) lê Usuario.assistenteVistoEm + papel
      → nulo? abre o pop-up de boas-vindas
      → "Fazer o tour"   → tours.ts (papel) → procura [data-assistente=...] → destaca
      → "Ver os guias"   → guias.ts (papel) → Accordion
      → pergunta         → action → ia.ts → guias do papel → Gemini → resposta + telas
                           (links filtrados pelo menu do papel)
      → qualquer saída   → marcarAssistenteVisto (grava a data)
```

Regra de negócio fica em `src/services/` (pura e testada); os componentes só renderizam.

---

## 3. Como manter

**Mudou uma tela, atualize o guia e o tour.** O assistente só é útil enquanto bate com o app.
Ao renomear um item de menu, mover um botão ou trocar o fluxo de uma tela, no mesmo PR:

1. ajuste o texto em `guias.ts`;
2. ajuste o passo em `tours.ts` (seletor e texto);
3. rode os testes abaixo.

### Testes que protegem

| Teste | O que garante |
|---|---|
| Links e rotas por papel | Todo link de guia/tour aponta para rota existente **e** permitida ao papel |
| CAMPO sem conteúdo financeiro | Nenhum guia/tour do CAMPO contém termos de dinheiro (valor, nota, conta a pagar, R$ etc.) |
| Seletores de tour | Todo seletor `data-assistente` usado nos passos existe no código dos componentes/páginas |

### Como adicionar

| Quero... | Faça |
|---|---|
| **Guia** | Novo item em `guias.ts` (id, título, papéis, corpo curto, link opcional); o teste de links valida a rota |
| **Tour novo** | Nova lista de passos em `tours.ts` e registro em `index.ts` |
| **Passo** | Inclua o atributo `data-assistente="..."` no elemento da tela e o passo em `tours.ts` com o mesmo seletor; o teste de seletores falha se o atributo não existir |

### E2E

Sem cuidado, o assistente abriria sozinho no primeiro login e cobriria a tela nos testes
Playwright. A fixture automática `assistenteDispensado` (`e2e/fixtures.ts`) marca como visto
(`updateMany` em `assistenteVistoEm`) todo usuário que já existe antes do teste. Quem testa o
pop-up cria a própria pessoa dentro do teste.

---

## 4. Mapa dos fluxos de negócio

### O ciclo

```
Obra ─► orçamento e datas por etapa ─► Lançamento (NF/recibo/folha/guia)
                                         │  itens × rateio por obra/etapa
                                         ▼
                                      Parcelas ─► Contas a pagar ─► pagamento
Avanço físico + RDO (campo) ─────────────────────────────────────────┐
                                                                     ▼
                                       Dashboard: custo, previsto × realizado, curva S, alertas
```

| Etapa do ciclo | Onde | Observação |
|---|---|---|
| Obra e etapas | `/obras` | Etapas de 1 nível, datas previstas; renomear e reordenar no Resumo da obra |
| Orçamento | `/orcamento` | Um valor por etapa; crédito de IBS/CBS e custo líquido (modo líquido); desempenho de custo (valor agregado, IDC, tendência, variação) e desembolso previsto × realizado por mês (pela linha de base oficial, quando existe) |
| Lançamento com rateio | `/notas` | Itens rateados por obra/etapa; duplicata avisada; importa XML de NF-e e NFS-e e lê PDF/foto; confere o IBS/CBS destacado (só avisos) |
| Parcelas | dentro do lançamento | Geradas na gravação; preservadas ao editar |
| Contas a pagar | `/contas` | Abertas, atrasadas, pagas; fluxo mensal |
| Avanço e RDO | `/cronograma`, `/diario` | Quem está no campo lança; o escritório corrige o avanço lançado |
| Dashboard | `/dashboard` | Só ADMIN e ESCRITORIO; filtro `?obra=`; avanço por obra com previsto, realizado, IDP e situação; alertas de etapas atrasadas e de tendência de custo |

### Cronograma: status, indicadores e linha de base

| Peça | Como funciona | Onde |
|---|---|---|
| **Etapas** | ADMIN e ESCRITORIO renomeiam (lápis) e mudam a ordem (setas ↑/↓) na lista de etapas do Resumo da obra. A ordem vale para o Gantt, o orçamento e o CSV. Atividades `etapa.renomear` e `etapa.reordenar` | `obras/actions.ts`, `obras/[id]/abas/etapa-acoes.tsx` |
| **Status da etapa** | Concluída; Sem datas; **Atrasada** (fim previsto vencido sem 100%, ou mais de 10 p.p. atrás do previsto); **Atenção** (mais de 5 e até 10 p.p. atrás); Não iniciada; Em dia. Exatamente 5 p.p. ainda é Em dia; exatamente 10 p.p., Atenção | `situacaoEtapa` em `services/cronograma.ts` |
| **Previsto, realizado e desvio** | Previsto linear nos dias entre início e fim; realizado = última medição **até hoje**; desvio = realizado − previsto, em p.p. Por etapa na aba Avanço e no balão do Gantt | `previstoEtapaNaData`, `desvioBp` |
| **IDP** | Índice de desempenho de prazo = realizado ÷ previsto até hoje (ponderado pelo orçamento), exibido como "0,92". Sem previsto ainda, "—". No cabeçalho do cronograma e na aba Cronograma da obra | `idp` (base 10000) |
| **Linha de base** | "Salvar linha de base" (ADMIN/ESCRITORIO, no card do Gantt) fotografa nome, datas e orçamento de todas as etapas e vira a oficial; a anterior fica guardada, mas deixa de valer. Exige ao menos uma etapa com datas. O Gantt mostra a barra fina da base e a coluna "Var. fim" (dias; + atrasou, − adiantou); a curva S passa a usar o previsto da base. Etapa excluída depois continua na foto. Atividade `cronograma.linha_base` | `LinhaBase`/`LinhaBaseEtapa`, `services/linha-base*.ts` |
| **Corrigir avanço** | ADMIN/ESCRITORIO corrigem data, % e observação pelo lápis do Histórico (aba Avanço). O valor continua preso entre os avanços das datas vizinhas da mesma etapa. Atividade `medicao.editar` | `editarMedicao`, `validarAvancoNaSerie(..., ignorarId)` |
| **Exportar CSV** | `/cronograma/exportar?obra=`: `;`, BOM UTF-8, datas dd/mm/aaaa; texto que começa com `= + - @` ganha `'` (sem fórmula). Colunas: etapa, início, fim, duração, previsto hoje, realizado, desvio, status, LB início, LB fim, variação do fim e **peso só para quem vê valores** (nunca CAMPO) | `services/cronograma-csv.ts` |
| **Imprimir** | "Imprimir / salvar PDF" (mesmo botão do RDO, `components/botao-imprimir.tsx`): A4 paisagem, sem menu, cabeçalho e assistente | `cronograma/page.tsx` |

O CAMPO vê status, IDP, desvio e a barra da linha de base, e exporta o CSV sem o peso; não edita datas, não salva linha de base, não corrige avanço e não renomeia nem reordena etapas.

### Papéis: quem vê o quê

| Papel | Obras | Lançamentos e contas | Diário/Cronograma | Orçamento/Dashboard | Usuários |
|---|---|---|---|---|---|
| ADMIN | todas | sim | sim | sim | sim |
| ESCRITORIO | todas | sim | sim | sim | não |
| CAMPO | só as atribuídas a ele | **não** | sim | **não** | não |

### Duas leituras do dinheiro

O sistema mostra o mesmo dinheiro de duas formas, de propósito:

| Leitura | Pergunta que responde | Conta | Onde |
|---|---|---|---|
| **Custo (competência)** | "Quanto a obra custou, e de quê?" | **itens × rateio**, na data da compra; no modo líquido, menos o crédito de IBS/CBS ([`reforma-tributaria.md`](reforma-tributaria.md)) | Dashboard, curva ABC, alertas, orçamento |
| **Fluxo (caixa)** | "Quanto sai, e quando?" | **parcelas × rateio**, no vencimento | Contas a pagar, Fluxo mensal |

Uma compra de R$ 12.000 em 3 parcelas pesa R$ 12.000 no custo do mês da compra e R$ 4.000 em cada
mês no fluxo. Por isso o filtro "Situação" do Fluxo mensal traz a explicação custo × caixa.

**Por que existe "Itens ≠ total":** o total da nota (o que será pago) pode diferir da soma dos itens
(frete, desconto, arredondamento, item esquecido). O custo usa os itens; o fluxo usa o total. A
diferença não é erro do sistema: é aviso para conferir. "Conferir notas" leva a
`/notas?divergentes=1` com o selo "Itens ≠ total".

---

## 5. Auditoria de fluxos × mercado

Fontes: Sienge (gestão financeira, regimes de caixa e competência, fluxograma de compras,
suprimentos), Omie (módulos de ERP para construção), OrçaFascio (gestão de projetos de obras,
compras) e o benchmark da seção 1 do plano. Links em
[`plano-evolucao.md`](plano-evolucao.md#fontes-consultadas).

### Cobertura por módulo

| Módulo | Situação | Principal lacuna |
|---|---|---|
| Obras e etapas | Parcial | Sem cliente, área, valor de contrato, término previsto, responsável técnico (ART/RRT); sem transições de status; EAP de 1 nível |
| Orçamento | Básico | Um valor por etapa; sem itens, composições, BDI ou reorçamento |
| Lançamentos (NF e afins) | Forte | Sem cancelamento (só exclusão); sem retenções como dado; série da NF-e fora da unicidade |
| Importação de NF-e (XML/PDF/foto) | Forte | XML sem conferência do destinatário e do cStat |
| Contas a pagar | Básico | Sem conta/juros/multa/desconto, sem pagamento parcial, sem alçada |
| Fluxo de caixa | Parcial | Só vencimentos; sem realizado (pagaEm) + projetado com saldo |
| Fornecedores | Forte (dependência) | Sem dados bancários/PIX; duplicidade só por nome |
| Contratos de empreiteiro | Ausente | Mão de obra fora do sistema |
| Compras | Ausente | Sem solicitação, cotação, pedido, recebimento |
| Contas a receber | Ausente | Sem receita nem margem por obra |
| Cronograma e avanço | Bom | Linha de base, status Atenção, IDP e exportação CSV entregues; sem dependências entre etapas |
| Diário de obra (RDO) | Bom | Sem aprovação/assinatura; sem vínculo com o avanço |
| Dashboard | Bom | Consultas leem tudo em memória |
| Documentos, estoque, qualidade, portal, notificações | Ausente | Backlog |

### Lacunas priorizadas

**Alta**

| Lacuna | Motivo |
|---|---|
| Contratos de empreiteiro com medição de serviço e retenções (caução, INSS, ISS) | Mão de obra é o maior custo e fica fora; retenção errada gera passivo fiscal |
| Compras: solicitação → cotação com mapa → pedido → recebimento → NF vinculada; custo comprometido × realizado | Hoje só se vê o custo depois da nota; o mercado controla desde o pedido |
| Contas a receber, receita e margem por obra, fluxo de caixa realizado (pagaEm) + projetado com saldo | Sem receita não há margem nem saldo; o fluxo atual só mostra saídas |
| Pagamento com conta, juros/multa/desconto e pagamento parcial | O valor pago real raramente é o da parcela |
| Aprovação de pagamento por alçada | Controle interno básico em qualquer ERP |

**Média — financeiro**

| Lacuna | Motivo |
|---|---|
| Contas filtradas por obra mostram a parcela inteira, não a parte do rateio | Soma por obra fica maior que a realidade em notas rateadas |
| Cartão com vencimento fixo no dia 20 e boleto fixo em 30 dias | Configurar por cartão/fornecedor; datas reais variam |
| Limite de 6 parcelas no formulário (o schema aceita 360) | Financiamentos e consórcios ficam sem caminho pela tela |
| Índice de dependência conta Folha/Guia como fornecedor e usa descrição em vez do material do catálogo | Distorce o score; folha e imposto não são fornecedor |
| Consultas que leem todas as notas e parcelas (custos, ABC, alertas, fluxo) | Devem virar agregação SQL antes do volume crescer |

**Média**

| Lacuna | Motivo |
|---|---|
| Obra sem cliente, área, valor de contrato, término previsto, responsável técnico (ART/RRT) e sem transições de status | RDO e avanço são aceitos em obra concluída ou pausada |
| Etapas sem hierarquia (EAP) e sem dependências (renomear, reordenar e linha de base já entregues) | Sem dependência, mudar uma data não empurra as etapas seguintes |
| RDO sem aprovação/assinatura e sem vínculo com o avanço | Diário não serve como prova nem alimenta o físico |
| Nota sem cancelamento (só exclusão definitiva) | Perde-se o histórico |
| Retenções (ISS/INSS) como dado | Hoje só aparecem em texto |
| Gravação do fornecedor e dos materiais na conferência acontece antes da nota | Podem ficar órfãos se a nota falhar |
| Série da NF-e fora da unicidade | Mesmo número em séries diferentes colide |
| XML sem conferência do destinatário e do cStat | Aceita nota de outro CNPJ ou não autorizada |
| Orçamento de um valor por etapa (sem itens/composições/BDI/reorçamento) | Adequado ao porte hoje; limita o previsto × realizado por insumo |

**Baixa**

| Lacuna | Motivo |
|---|---|
| Aditivos (change orders) | Só importam com obra por encomenda |
| Documentos da obra (plantas, contratos, alvarás) | Já previsto em 2.4 |
| Estoque | Pequeno ganho para obras de lote |
| Checklists/FVS | Diferencial de qualidade, não de controle de custo |
| Exportação CSV/PDF fora do cronograma (o cronograma já exporta CSV e imprime) | Conveniência |
| Dados bancários/PIX do fornecedor e deduplicação por nome | Facilita pagamento e limpa cadastro |
| Desativar material pela tela | Hoje só pelo banco |
| Portal do cliente | Só com obra por encomenda |
| Notificações/WhatsApp | Onda 3 |
| `/importar` sem link no app | Ferramenta de migração única |

### Quick wins entregues neste ciclo

Ver lista em [`plano-evolucao.md`](plano-evolucao.md#quick-wins-feitos-neste-ciclo).
