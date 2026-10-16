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
- Movimento só em resposta a ação do usuário; `prefers-reduced-motion` zera animações e transições.
- Botão com verbo: "Salvar lançamento", "Registrar RDO", "Marcar como pagas".
- Tema claro (padrão) e escuro ("Prancheta noturna"): botão no cabeçalho. A escolha vai no cookie `tema` e o servidor já entrega o `<html>` com a classe `dark` (sem piscar e sem script inline, por causa do CSP). A cor da barra do navegador (`generateViewport`) acompanha o tema. O bloco `.dark` só vale em tela: a impressão do RDO é sempre clara.

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
