# Handoff A3 — Planejamento (Onda 1, item 1.3)

## O que foi feito

### Regra de negócio: `src/services/cronograma.ts` (+ `__tests__/cronograma.test.ts`, 34 testes)
Funções puras sobre dias `"aaaa-mm-dd"` e meses `"aaaa-mm"` (strings, sem fuso):
- **Datas:** `diaDoBanco` / `diaParaBanco` (colunas `@db.Date`, em UTC), `diaValido`, `mesesEntre`,
  `duracaoEmDias`, `somarDias`.
- **Validação:** `validarDatasEtapa(inicio, fim)`: datas opcionais, mas o fim não pode ser anterior ao início.
- **Curva S prevista:** `previstoEtapaNaData` distribui linearmente pelos dias corridos, de início a fim inclusive.
  `previstoNaData` pondera as etapas com o próprio `avancoPonderado`, então vale a mesma regra de pesos.
- **Curva S realizada:** `realizadoPorEtapaNaData` (a última medição até o dia) e `realizadoNaData`.
- **Série mensal:** `curvaS(etapas, medicoes, hoje, faixa?)` dá o previsto ao fim de cada mês e o realizado
  ao fim de cada mês. No mês corrente o realizado vai até hoje; nos meses futuros é `null`.
  `faixaDaCurvaS` define a faixa de meses. `agregarCurvasS` e `unirFaixas` montam o agregado de várias obras.
- **Situação:** `situacaoEtapa` → `NAO_INICIADA | EM_DIA | ATRASADA | CONCLUIDA | SEM_DATAS`.
  A margem é `MARGEM_ATRASO_BP = 1000` (10 p.p.). Os rótulos ficam em `ROTULO_SITUACAO`.
- **Gantt:** `escalaGantt` monta o eixo em meses inteiros, com o marcador de hoje. `posicaoNoGantt` posiciona cada barra.
- `pesosDasEtapas` dá o peso de cada etapa em % (exibido sem R$).

`services/obra.ts` ficou **sem alteração**: `avancoPonderado` e `validarAvanco` foram reaproveitados.

### Rotas e arquivos
- **`/cronograma?obra=<id>[&aba=avanco]`** (`src/app/(app)/cronograma/`), acessível a ADMIN, ESCRITORIO e CAMPO:
  - `page.tsx`: seletor de obra (igual ao das outras páginas), resumo "Previsto até hoje · Realizado ·
    N etapas atrasadas" e duas abas por link:
    - **Planejamento:** Gantt, botão "Editar datas" (ADMIN/ESCRITORIO) e curva S previsto × realizado.
    - **Avanço:** é a antiga página Medições. Tem cards por etapa com badge de situação e botão "+ Avanço"
      (CAMPO pode lançar), e o histórico com exclusão (só ADMIN/ESCRITORIO).
  - `actions.ts`:
    - `salvarDatasEtapas(obraId, formData)` (ADMIN/ESCRITORIO) salva todas as etapas numa transação.
      O erro cita a etapa, por exemplo "Fundação: O fim previsto não pode ser anterior ao início".
    - `criarMedicao` (qualquer papel) e `excluirMedicao` (ADMIN/ESCRITORIO) vieram de `medicoes/actions.ts`.
    - Todas usam `acaoDeEscrita` e revalidam `/cronograma`, `/dashboard` e `/obras/<id>`.
  - `dados.ts`: `carregarCronograma(obraId)` é a leitura compartilhada pela página, pela aba e pelo widget.
    Também exporta `paraPlano`, `paraGrafico` e `hojeDia`.
  - `gantt.tsx`: Gantt em HTML/CSS (server component). Barra do início ao fim previsto, preenchida até o
    % realizado e colorida pela situação, com marcador de hoje, legenda e tooltip nativo (`title`) com datas,
    duração, % e peso. Tem uma variante `compacto`.
  - `curva-s-chart.tsx`: gráfico de linhas em recharts (client). Previsto em azul tracejado, realizado em
    âmbar contínuo, mesmas cores do "Orçado × Realizado" do dashboard.
  - `datas-dialog.tsx`, `medicao-dialog.tsx` (movido de `medicoes/`), `avanco.tsx` e `situacao.tsx`
    (badge e cores por situação).
- **`/medicoes`** agora só redireciona para `/cronograma?obra=<id>&aba=avanco` (o `?obra=` é mantido).
  `medicoes/actions.ts` e `medicao-dialog.tsx` saíram de lá (nada fora da pasta os importava).
- **Aba Cronograma da obra** (`obras/[id]/abas/cronograma.tsx`): mantém `AbaCronograma(props: AbaObraProps)`.
  Mostra o resumo previsto/realizado, o Gantt compacto e a curva S lado a lado, e os botões "Lançar avanço"
  e "Abrir cronograma".
- **`CurvaSWidget`** (`dashboard/widgets/curva-s.tsx`): continua sem props. Exibe um Card `lg:col-span-2` com
  a curva agregada das obras em ANDAMENTO que têm datas e o "hoje: previsto × realizado". Retorna `null`
  quando nenhuma obra tem datas.

Validado: `tsc --noEmit`, `eslint` nos meus arquivos, `vitest` (111 testes) e um teste no navegador na
porta 3103 cobrindo:
- erro de fim antes do início;
- salvar datas;
- lançar avanço como ADMIN e como CAMPO;
- CAMPO sem "Editar datas", sem lixeira e sem nenhum "R$";
- redirect de `/medicoes`;
- aba da obra e widget no dashboard;
- layout no celular (390px).

## Decisões tomadas
1. **Fuso:** `inicioPrevisto` e `fimPrevisto` são `@db.Date`, então leio e gravo pelos componentes UTC
   (`diaDoBanco` / `diaParaBanco`). `Medicao.data` continua gravada ao meio-dia local (`inputParaData`) e
   é lida com `dataParaInput`. O service só vê strings de dia, então não desloca datas.
2. **Etapas sem datas** pesam, mas não avançam no previsto. Por isso a curva prevista só chega a 100% quando
   todas as etapas têm datas, e a página avisa quando isso acontece. Assim previsto e realizado usam a mesma base.
3. **Datas parciais** (só o início ou só o fim) são aceitas. A etapa conta como `SEM_DATAS` até ter as duas.
4. **Situação:** `CONCLUIDA` vale com 100% mesmo sem datas. Depois do fim previsto sem 100%, a etapa é
   `ATRASADA` mesmo dentro da margem.
5. **Faixa da curva:** começa no primeiro início previsto, ou na primeira medição se ela for anterior.
   Termina no último fim previsto, estendida até o mês corrente enquanto a obra não chega a 100%.
   O eixo do Gantt também se estende até hoje, mas no máximo 12 meses além do plano.
6. **Ponto do mês corrente:** o previsto é calculado ao fim do mês (é o plano) e o realizado até hoje.
   Os números "hoje" do cabeçalho e do widget comparam previsto e realizado na mesma data.
7. **Agregado do dashboard:** cada obra pesa pelo seu orçamento total, com a mesma regra de `avancoPonderado`.
   Se alguma obra tem orçamento, as obras sem orçamento **não pesam**. Se nenhuma tem, os pesos são iguais.
8. **Nenhum valor em R$** aparece no cronograma. O orçamento só aparece como "peso X% da obra" no tooltip do Gantt.
9. A aba "Avanço" é uma sub-aba de `/cronograma` (`?aba=avanco`), no mesmo padrão de abas por link da página da obra.

## Pendências
- O Gantt não tem arrastar/redimensionar nem dependências entre etapas. A edição é por formulário.
- A medição continua sem edição (só excluir e relançar), como antes. Isso é o item 4 dos ajustes do plano.
- Dados de teste ficaram no banco `gestao_obras_a3`: datas e medições no Lote 01, 02 e 03, e o usuário
  `campo@obras.local` com a senha `admin123`. São só desse banco.
- A rota `/medicoes` (redirect) pode ser removida num ciclo futuro, junto com `/importar`.

## Pedidos ao integrador
Nenhum é obrigatório: o menu já aponta para `/cronograma`, e a página da obra e o dashboard já importam
a aba e o widget com as assinaturas mantidas. São só ajustes de texto ou link em arquivos de outros donos.

1. **`src/app/(app)/dashboard/page.tsx`** (A5), no card "Avanço físico". Troque o texto do vazio:
   ```tsx
   <Vazio texto="Registre medições para acompanhar o avanço." />
   ```
   por:
   ```tsx
   <Vazio texto="Lance o avanço das etapas em Cronograma → Avanço." />
   ```
2. **`src/app/(app)/obras/actions.ts`**, em `excluirEtapa`. Troque a mensagem de erro:
   ```ts
   "Etapa possui medições ou custos vinculados — não pode ser excluída."
   ```
   por:
   ```ts
   "Etapa possui avanço lançado ou custos vinculados — não pode ser excluída."
   ```
3. **(Opcional) `src/app/(app)/obras/[id]/abas/resumo.tsx`**, no `CardHeader` do card "Etapas", ao lado do
   botão "+ Etapa". Adicione um link para o cronograma, porque as datas previstas se editam lá:
   ```tsx
   <Button variant="outline" size="sm" render={<Link href={`/cronograma?obra=${obra.id}`} />}>
     Cronograma
   </Button>
   ```
   Para isso, envolva os dois botões num `<div className="flex gap-2">`.
4. **e2e:** se o integrador incluir um passo de avanço no `e2e/fluxo-critico.spec.ts`, o fluxo é
   `/cronograma?obra=<id>&aba=avanco` → botão "Avanço" no card da etapa → campo `percent` →
   "Registrar avanço".
