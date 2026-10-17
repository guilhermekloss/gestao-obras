# Identidade visual: "Prancheta"

Papel frio, tinta nanquim e azul de planta heliográfica. A estrutura visual carrega informação como numa planta: linhas de cota, réguas e etiquetas.

## Cores (tokens em `src/app/globals.css`)
| Token | Hex | Uso |
|---|---|---|
| `background` (Papel) | `#f3f5f6` | fundo |
| `card` (Folha) | `#ffffff` | cartões, tabelas, menu |
| `foreground` (Nanquim) | `#14202b` | texto |
| `muted-foreground` (Grafite) | `#4a5967` | texto secundário |
| `primary` (Azul-planta) | `#0f4c81` | ação principal, foco, links |
| `border` (Cota) | `#c5cfd6` | bordas e réguas |
| `input` | `#7c8b97` | borda de campo (3:1 contra a Folha) |

## Estados
Estado = fundo claro + borda + ícone + palavra. A cor nunca vai sozinha. **Preenchimento sólido é só para ação** (botão), nunca para estado.
Use sempre `StatusBadge` (`src/components/status-badge.tsx`); não crie cores de estado novas.

| Estado | Token | Onde |
|---|---|---|
| No prazo | `estado-no-prazo` | etapa em dia, condição praticável |
| Atenção | `estado-atencao` | alertas, obra pausada, condição parcial |
| Atrasado | `estado-atrasado` | etapa atrasada |
| Vencido | `estado-vencido` | parcela vencida, alerta crítico, condição impraticável |
| Pago | `estado-pago` | parcela paga, obra ou etapa concluída (resolvido, recua) |
| Em andamento | `estado-andamento` | obra em andamento |
| Neutro | `estado-neutro` | planejamento, não iniciada, aberta |

Cada token tem três variações: `estado-x` (fundo), `estado-x-fg` (texto) e `estado-x-borda`.

## Tipografia
Uma família só, **Archivo** variável, e a largura (`font-stretch`) separa os papéis:
- texto e interface: largura 100;
- títulos (`h1`–`h4`, título de cartão e de diálogo): largura 112, peso 600, aplicado em `globals.css`;
- números e cotas: classe `num` (largura 80, algarismos tabulares).

## Forma
- Raio: controle 6 px (`--radius`), cartão ~8 px (`rounded-xl`), etiqueta ~4 px (`rounded-sm`). Sem pílulas.
- Sem sombra decorativa; separação por borda.
- **Régua de cota** (`src/components/regua-cota.tsx`) é a barra de avanço: traço fino com marca nas pontas e no valor atual.

## Regras de interface
- Alvo de toque ≥ 44 px: `Button` sobe para 45 px em ponteiro grosso (`pointer-coarse:`). Ícones pequenos e checkboxes ganham área de toque maior que o desenho.
- Foco de teclado: anel de 3 px em azul-planta, nunca removido.
- **Nome acessível:** botão só com ícone leva `aria-label` (`title` sozinho não basta). `ConfirmButton` recebe `rotulo`; o gatilho de `FormDialog` é o próprio `Button` (sem `<span>` por fora, que criava controle dentro de controle).
- **Campos de filtro:** todo `<label>` leva `htmlFor` e o controle leva o mesmo `id` (`ComboboxFiltro` aceita `id`). `Combobox` expõe `role="combobox"` e a lista como `listbox`.
- **Títulos:** um `h1` por tela, com `<title>` próprio (`metadata` da página, modelo "Tela · Gestão de Obras"). Título de cartão (`CardTitle`) e de seção recolhível (`AccordionTrigger`) são `h2`; dentro de um bloco que já tem `h2`, use `CardTitle nivel={3}`.
- **Voltar e abas:** `LinkVoltar` e `AbasDaPagina` (`src/components/`) já trazem alvo de 44 px; a aba atual leva `aria-current="page"`.
- **Estado de erro** (botão e selo destrutivos, alerta de erro) usa o par `estado-vencido` / `estado-vencido-fg`: o vermelho translúcido dava 4,3:1.
- **Escala de espaçamento:** 0, 0,5, 1, 1,5, 2, 3, 4, 5, 6, 8, 10, 12… (`gap-2.5`, `p-3.5`, `py-2.5` ficam de fora). Exceção conhecida: `md:mt-7` do botão "Remover" do rateio, que alinha com a base do campo ao lado.
- **Regressão:** `e2e/acessibilidade.spec.ts` confere, no celular, `h1`, `<title>`, nome acessível e alvo de 44 px em cada tela do menu.
- Movimento só em resposta a ação do usuário; `prefers-reduced-motion` zera animações e transições.
- Botão com verbo: "Salvar lançamento", "Registrar RDO", "Marcar como pagas".
- Tema claro (padrão) e escuro ("Prancheta noturna"): botão no cabeçalho. A escolha vai no cookie `tema` e o servidor já entrega o `<html>` com a classe `dark` (sem piscar e sem script inline, por causa do CSP). A cor da barra do navegador (`generateViewport`) acompanha o tema. O bloco `.dark` só vale em tela: a impressão do RDO é sempre clara.

## Dashboard: hierarquia e gráficos
- Três blocos, nesta ordem: **Pede ação hoje** (parcelas a vencer e notas divergentes em destaque, alertas logo abaixo), **Como estão as obras** (gasto no mês, obras ativas, avanço físico, top insumos) e **Gráficos**. Os indicadores não têm o mesmo peso: o de maior peso é o dinheiro a vencer (número grande e botão cheio), depois as divergências, depois o gasto do mês; "Obras ativas" fica discreto.
- `Pendencia` (em `dashboard/page.tsx`): faixa e selo de estado só quando há o que fazer; em dia, o cartão recua e o botão some.
- Gráficos (Recharts) ficam em `dashboard-charts.tsx` e `cronograma/curva-s-chart.tsx`, com peças comuns em `src/components/grafico.tsx`:
  - cores só dos tokens `--chart-*`; vermelho é estado, nunca série;
  - **rótulo direto no lugar da legenda** (nome ao lado da última coluna, no fim da linha). Onde não cabe (contêiner abaixo de 560 px) vira lista de cores (`ChavesDeSerie`);
  - valores em R$ abreviado nos eixos e rótulos (`formatarMoedaAbreviada`: "R$ 48,2 mil"); o valor completo fica no balão e na tabela;
  - série planejada (orçado, previsto) é tracejada: a diferença não depende só da cor;
  - balão (`TooltipGrafico`): abre com mouse, toque ou setas (Tab foca o gráfico) e fecha com Esc;
  - `TabelaDoGrafico`: os mesmos números em tabela recolhida, o caminho para leitor de tela.

## Casca (menu e cabeçalho)
- Cabeçalho fixo com o nome da seção atual (`TituloDaPagina`), botão de tema, Minha conta e Sair.
- Menu lateral (desktop): item ativo com fundo `nav-ativo`, marca lateral e `aria-current="page"`; nome e papel do usuário no rodapé.
- Barra inferior (celular): 4 itens + "Mais" com as demais telas, em folha que sobe da base. Perfil com até 4 telas (campo) não mostra "Mais". Rótulos completos, em até 2 linhas. Quais itens ficam na barra: campo `fixo` em `src/components/nav-itens.ts`.
- Permissões por papel ficam em `nav-itens.ts` (`papeis`) e têm teste em `src/components/__tests__/nav-itens.test.ts`.

## Formulário de campo (RDO)
Pensado para uma mão, sol forte e luva. O padrão vale para qualquer formulário longo que se preenche na obra.
- **Campos grandes:** entradas de 63 px (`h-14`), texto em 18 px, rótulo em `text-base font-semibold` acima do campo. Nada de `<select>` para poucas opções: use `SeletorOpcoes` (`src/components/seletor-opcoes.tsx`), botões de 72 px com ícone, borda de 2 px e visto na opção marcada (a seleção não depende só da cor). Um toque escolhe, outro toque na mesma opção limpa.
- **Contadores:** `+` e `−` de 54 px com o número em `num` de 24 px (`contador-lista.tsx`). A linha com quantidade fica com fundo `nav-ativo`.
- **Seções recolhíveis:** `Accordion` (`src/components/ui/accordion.tsx`, Base UI). Cada seção mostra o resumo do que foi preenchido, mesmo fechada. O quadrado do ícone diz o estado: **tracejado** = falta preencher, **cheio com visto** = tem conteúdo, **vermelho** = obrigatório e vazio depois de tentar salvar.
- **Ação fixa na base:** `BarraDeAcao` (`src/components/barra-de-acao.tsx`) fica logo acima da barra inferior. A `BottomNav` publica a altura dela em `--altura-bottom-nav`, que muda com rótulo em 2 linhas e com a área segura do aparelho. A tela precisa de `pb-24` embaixo. Foco e rolagem por âncora respeitam o cabeçalho e a barra (`scroll-padding` em `globals.css`).
- **Rascunho:** o RDO guarda o que foi digitado no `localStorage` (uma chave por RDO, validade de 7 dias, 500 ms depois da última mudança). Ao reabrir, o aviso "Recuperamos o rascunho" tem o botão "Descartar". Salvar ou cancelar a edição apaga o rascunho. Lógica em `diario/novo/rascunho.ts`, com teste.
- **Confirmação:** depois de salvar, a tela vira um painel verde "RDO salvo" com "Ver RDO" e "Voltar ao diário". Sem redirecionamento automático, para dar tempo de ler com luva.

## Lançamento de nota e Contas a pagar
Vale para `notas/nova`, `notas/[id]`, `notas/importar-xml` e `contas`. Nenhuma regra de negócio muda: os totais vêm das mesmas funções de `services/`.
- **Seções recolhíveis** (`Accordion` + `CabecalhoSecao`): Documento, Itens, Rateio e Pagamento (na importação: Itens, Rateio e Parcelas). Todas abrem já abertas; cada uma mostra o resumo e o estado no quadrado do ícone (tracejado = falta, cheio com visto = ok, âmbar = confere, vermelho = corrigir). `CabecalhoSecao` é o mesmo do RDO, com a opção `compacto`.
- **Conferência fixa** (`ResumoLancamento`): tira presa sob o cabeçalho com o total e três linhas (itens, rateio, parcelas), cada uma com ícone, palavra e a diferença em reais ("Faltam R$ 40,00 do total"). Tocar na linha abre a seção. No celular recolhe para uma linha. **Itens diferentes do total é aviso** (o servidor pergunta "Salvar mesmo assim?" e a tela mostra isso num diálogo); **rateio fora de 100% e parcelas fora do total são erro**. Texto em `notas/conferencia-lancamento.ts`, com teste.
- **Erro junto ao campo** (`CampoForm`, `MensagemErro`, `atributosDoErro`): ícone e frase abaixo do campo, ligada por `aria-describedby`. O formulário valida ao sair do campo e, ao salvar, abre as seções com erro e leva o foco ao primeiro campo inválido. Erro de rateio e de parcelas aparece no fim da própria seção.
- **Ação fixa na base** (`BarraDeAcao`): "Salvar lançamento" / "Salvar alterações" / "Importar nota". No celular fica só a ação principal e "Cancelar" vai para o fim do formulário.
- **Contas a pagar:** abertas ordenadas por urgência (mais atrasada primeiro; no mesmo dia, maior valor), com o prazo no `StatusBadge` ("Venceu há 12 dias", "Vence hoje", "Vence em 3 dias"). Um aviso no topo soma as vencidas e tem "Selecionar vencidas". Ao marcar parcelas, a barra de lote aparece na base com a contagem, o total e "Marcar como pagas"; antes de gravar, `ConfirmarDialog` lista o que será pago e pede "Confirmar pagamento". A barra fica **fora** do contêiner da lista, porque `container-type` prende elementos fixos dentro dele. Ordem e rótulos em `contas/urgencia.ts`, com teste.

## Listas e tabelas no celular
Use `ListaDeDados` (`src/components/lista-de-dados.tsx`) em vez de `<Table>` solto. Há um único DOM; o CSS troca o desenho conforme a **largura do contêiner** (variantes `tabela:` e `cartao:` em `globals.css`, corte em 800 px). Isso vale também para colunas estreitas, como a equipe da obra.

| Modo | Quando usar | Telas |
|---|---|---|
| `cartoes` (padrão) | Cada linha é um registro que se lê sozinho | Lançamentos, Contas, Fornecedores, Materiais, prévia da NF-e, usuários, convites, diário e equipe da obra, últimas notas/compras, acessos recentes |
| `rolagem` | Comparar colunas importa (matriz ou análise) | Curva ABC, Fluxo mensal |

- **Cartão:** cada coluna tem um `papel`: `titulo` (link que identifica a linha), `valor` (canto direito do título), `estado` (`StatusBadge`), `acao`, `selecao` e `detalhe` ("Rótulo: valor"). `semCartao` deixa a coluna só na tabela. Célula vazia vira "—" na tabela e some do cartão.
- **Rolagem:** a primeira coluna fica fixa; a região rola com o teclado (`tabindex=0`, `role="region"`) e mostra a dica "Role para o lado…" quando estreita.
- **Valores** (R$, quantidade, %): `numerica` → à direita, `num` (algarismos tabulares).
- **Estado** sempre em `StatusBadge` (parcela, convite, situação do usuário, dependência do fornecedor, condição do RDO). **Categoria** (tipo de documento, papel do usuário, classe ABC) fica no `Badge`.
- Link de linha: use `LINK_DA_LINHA` (44 px no celular). Botões de ícone da linha ganham texto no cartão.
- Orçamento vs. realizado não usa `ListaDeDados`: é um formulário com campos editáveis e já vira cartão no celular.

## Carregando, erro e página não encontrada
- **Carregando:** cada tela de lista tem `loading.tsx` (dashboard, notas, contas, obras, diário, cronograma) com esqueleto no desenho da tela, sem spinner. Use o `Skeleton` de `src/components/ui/skeleton.tsx` e os blocos de `src/components/carregando.tsx` (`Carregando`, `CabecalhoSkeleton`, `FiltrosSkeleton`, `TabelaSkeleton`). O pulso some com `prefers-reduced-motion`.
- **Atenção ao colocar um `loading.tsx`:** ele envolve também as rotas filhas, e uma resposta que já começou a ser enviada não consegue mais devolver HTTP 404 no `notFound()` (o teste e2e do convite depende desse 404). Por isso, em obras, notas e diário o `page.tsx` da lista e o `loading.tsx` ficam no grupo `(lista)`, que não muda o endereço, e as telas de detalhe (`[id]`) ficam de fora. Há um teste que garante isso.
- **Erro:** `src/app/(app)/error.tsx` (dentro da casca) e `src/app/error.tsx` (fora dela e falha do próprio layout) usam `ErroDePagina`. Nada do erro vai para a tela. O texto cobre falha do sistema e falta de acesso, porque `exigirPapel` lança erro e em produção o Next esconde a mensagem. Esta versão do Next entrega `retry` (não `reset`).
- **Não encontrado:** `not-found.tsx` com casca (`notFound()` nas telas) e sem casca (endereço que não existe). Também cobre "sem acesso", porque o app responde igual para registro inexistente e registro proibido.
- Limitação: em dashboard, contas e cronograma, as telas filhas (`/dashboard/alertas`, `/contas/fluxo`) mostram o esqueleto da seção até ganharem o próprio `loading.tsx`.

## Assistente de navegação

Ajuda embutida (ver [`assistente-e-fluxos.md`](assistente-e-fluxos.md)). Visual discreto: não
compete com o conteúdo e segue o estilo do app (bordas em vez de sombras).

| Elemento | Especificação |
|---|---|
| **Botão fixo** | Ícone `Compass`, 44 px, com borda, **sem sombra**, canto inferior direito. Fica acima da BottomNav usando `--altura-bottom-nav`; **sobe** nas telas com `BarraDeAcao` para não cobrir os botões. |
| **Pop-up de boas-vindas** | `Dialog`. Botões: **"Fazer o tour (2 min)"** (primário), **"Ver os guias"** e **"Agora não"**. |
| **Tour** | Moldura de destaque no 1º elemento visível do passo; cartão com **"Passo x de y"**. `Esc` fecha; o foco vai para o cartão e volta ao fim. Respeita `prefers-reduced-motion` (sem animação). Alvos ocultos são **pulados**. |
| **Central de ajuda** | Folha lateral (desktop) ou de baixo (celular); guias em `Accordion`. |
| **Texto por papel** | Cada papel lê só o seu conteúdo. O **CAMPO nunca vê valores**, notas ou contas — nem em guia, tour ou resposta da IA. |
