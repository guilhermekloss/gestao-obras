# Handoff — A5 Análises (Onda 1)

## O que foi feito

### Services
- **`src/services/analises.ts`** (novo). Funções puras no topo e carregadores do banco no fim:
  - `curvaAbc(notas)`: agrupa por descrição normalizada + unidade, soma custo e quantidade (× fração do rateio), ordena e classifica em A/B/C. Retorna quantidade, preço médio, nº de fornecedores, participação, acumulado e o resumo por classe. Também exporta `classeAbc` e `normalizarDescricao` (cópia comentada de `dependencia.ts#normalizar`).
  - `consumoBp` / `faixaConsumo`: % consumido do orçamento e faixa (`SEM_ORCAMENTO` / `OK` / `ATENCAO` ≥ 90% / `ESTOURO` > 100%).
  - Alertas: `alertasOrcamento`, `alertasParcelasVencidas`, `alertasDivergencia` e `montarAlertas`. Cada `Alerta` tem `id`, `tipo`, `severidade` (`CRITICA` | `ATENCAO`), `mensagem` e `link`.
  - Carregadores: `carregarCurvaAbc(filtro)` (obra, de, até, tipo) e `carregarAlertas(hoje)`.
- **`src/services/custos.ts`**: só acréscimos. As funções existentes não mudaram.
  - `realizadoPorEtapaTodas()`: realizado por etapaId de todas as obras numa consulta só (usado pelos alertas).
  - `chaveMes` passou a ser exportada (o KPI do dashboard usa).
- Testes: `src/services/__tests__/analises.test.ts` (13) e `src/services/__tests__/custos.test.ts` (5, com o Prisma mockado).

### Rotas
- **`/orcamento`**: mostra o % consumido por etapa com cor por faixa, uma legenda, a linha "Total da obra" com % e barra, e um botão "Curva ABC de insumos". A faixa é calculada no servidor. As cores ficam em `orcamento/faixa.ts`, um arquivo sem Prisma para o client poder importar.
- **`/orcamento/abc`** (nova, só ADMIN/ESCRITORIO): filtros de obra, de, até e tipo; um card por classe com quantos insumos tem e qual % do custo; tabela com a classe destacada (badge + fundo nas linhas A).
- **`/dashboard`**:
  - O KPI "Gasto no mês" agora usa a mesma base dos gráficos (`realizadoPorMes`), com um comentário explicando. O KPI "Divergências" passou a sair dos alertas, então não há mais consulta duplicada.
  - Card "Alertas": mostra os 8 primeiros, com "Ver todos (N)" quando houver mais.
  - Card "Top 5 insumos (curva ABC)": barras de participação e link para `/orcamento/abc`.
  - O redirecionamento de CAMPO para `/diario` foi mantido. `<CurvaSWidget />` continua no fim do grid `lg:grid-cols-2`.
- **`/dashboard/alertas`** (nova, ADMIN/ESCRITORIO): lista completa dos alertas.
- Componentes locais: `dashboard/alertas-lista.tsx` e `dashboard/top-insumos.tsx`.

## Decisões tomadas
1. **Base do "Gasto no mês"**: itens × rateio por data de compra, igual ao gráfico "Gasto mensal por obra". O KPI bate com a barra do mês. Notas sem rateio ficam de fora, como já acontecia nos gráficos. A diferença entre itens e total da nota continua visível no KPI e nos alertas de divergência.
2. **Classe ABC**: a classe sai do acumulado *antes* do insumo. O insumo que cruza 80% ainda é A, e o que cruza 95% ainda é B. Por isso a classe A pode passar um pouco de 80% (os cards dizem "~80%"). Sem isso, um insumo sozinho com 90% do custo seria B. A comparação é feita em centavos, sem arredondar percentuais.
3. **ABC sem filtro de obra**: a nota entra inteira (100%), inclusive notas sem rateio. Com filtro, entra só a fração da obra. A quantidade também é multiplicada pela fração, então o preço médio fica igual com ou sem filtro.
4. **Insumo** = descrição normalizada (trim, minúsculas, espaços colapsados) + unidade em maiúsculas. A grafia e o tipo exibidos vêm do maior item do grupo.
5. **Alertas de orçamento** só valem para etapas com orçamento > 0. Etapas sem orçamento gerariam ruído no começo da obra. O link leva a `/orcamento?obra=<id>`.
6. **Parcelas vencidas** (status ABERTA, vencimento antes de hoje) geram um alerta por nota, não por parcela, com a mais antiga primeiro. O link leva a `/notas/<id>`.
7. **Divergência**: igualdade exata entre o total da nota e a soma dos itens, mesma regra do KPI antigo. A maior diferença vem primeiro.
8. **Ordem dos alertas**: estouro, depois parcela vencida (ambos críticos), depois atenção de orçamento, depois divergência.
9. A faixa "atenção" mudou de > 85% (valor antigo no formulário) para ≥ 90%, como pedido.

## Pendências
- `carregarCurvaAbc` e `carregarAlertas` leem todas as notas e itens em memória, como `realizadoPorObra` (item 6 do plano). Quando o volume crescer, viram agregação SQL.
- Os lançamentos sem NF do A1 (RECIBO/FOLHA/GUIA) entram na ABC e nos alertas automaticamente se usarem `NotaFiscal` + `ItemNota`, como define o schema. Vale conferir depois do merge se os itens desses lançamentos têm descrição e unidade úteis para a ABC.
- O aviso já existente de `_formData` sem uso em `orcamento/actions.ts` é anterior a este trabalho e não foi alterado.

## Pedidos ao integrador
1. **Widget da curva S (A3)**: em `src/app/(app)/dashboard/page.tsx`, `<CurvaSWidget />` continua como último filho do `<div className="grid gap-6 lg:grid-cols-2">`. Ao fazer o merge com o A3, mantenha esse bloco. O widget deve ocupar as duas colunas (`lg:col-span-2` no próprio card do A3).
2. **Conflito esperado em `dashboard/page.tsx`**: se outro branch mexer nesse arquivo, a versão do A5 é a de referência. A Fase 0 o deixou só com o import do widget.
3. **Opcional, aba Resumo da obra (A3/Fundação)**: para mostrar os alertas de uma obra, filtre `carregarAlertas()` pelo link:
   ```ts
   const alertas = (await carregarAlertas()).filter((a) => a.link === `/orcamento?obra=${obraId}`);
   ```
   Não fiz isso porque `obras/[id]/abas/resumo.tsx` não é do A5.
4. Não é preciso mexer em `nav.tsx`: `/orcamento/abc` e `/dashboard/alertas` ficam sob itens que já estão no menu ("Orçamento" e "Dashboard").
