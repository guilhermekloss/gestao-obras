# Handoff — A4 Diário (Onda 1)

Branch: `worktree-agent-ad995a7ecea062352` (base: `1a0dd1d`, Fase 0).

## O que foi feito

### Service (`src/services/rdo.ts`, testes em `src/services/__tests__/rdo.test.ts`, 31 casos)
- `normalizarEfetivo` / `normalizarEquipamentos`: leem o Json do banco de forma tolerante. Descartam entradas malformadas, nome vazio e qtd ≤ 0; aparam espaços; truncam fração; somam duplicadas (sem diferenciar caixa nem acento).
- `validarEfetivo` / `validarEquipamentos`: validação estrita para gravação. Erros: nome vazio, qtd não inteira ou negativa, qtd > 999. Itens com qtd 0 são descartados.
- `totalPessoas(efetivo)`: aceita o Json cru.
- `CLIMAS` (`SOL`, `NUBLADO`, `CHUVA`, `CHUVA_FORTE`), `rotuloClima`, `CONDICOES`, `rotuloCondicao`, `resumoClima` (turnos, ou o texto legado `clima` como fallback).
- `permissaoRdo` / `podeAlterarRdo`: ADMIN e ESCRITORIO sempre podem. CAMPO só altera o próprio RDO e só até `PRAZO_EDICAO_CAMPO_DIAS = 7` dias após a criação. Vale para editar e para excluir.
- `diffFotos`: na edição, calcula quais fotos remover e quais criar (compara por URL).
- `urlFotoValida`: aceita só caminho interno (`/…`) ou `https://`, o que bloqueia `javascript:` e `//host`.
- `dataDoRdo`: reancora `DiarioObra.data` (`@db.Date`, que chega como meia-noite UTC) ao meio-dia local. Ver "Decisões".

### Rotas e arquivos (`src/app/(app)/diario/`)
| Rota / arquivo | O quê |
|---|---|
| `actions.ts` | `criarRdo` (agora devolve `id`), **`atualizarRdo(id, input)`** (novo) e `excluirRdo(id, destino?)`. Todas usam `acaoDeEscrita` e a regra de `permissaoRdo`. Gravam `climaManha`, `climaTarde`, `condicao` e `equipamentos`, e nunca escrevem o `clima` legado. Unicidade obra+data checada antes de gravar, e o erro P2002 também é tratado (corrida). Revalidam `/diario`, `/diario/<id>` e `/obras/<obraId>` (também a obra antiga, se o RDO mudou de obra). |
| `novo/page.tsx` | `/diario/novo?obra=<id>` pré-seleciona a obra se ela estiver ativa. |
| `novo/rdo-form.tsx` | Formulário compartilhado entre criar e editar (prop `rdo`). Selects de clima de manhã e de tarde, botões de condição, efetivo e equipamentos com +/− e um campo "Incluir" para item fora da lista, fotos com adicionar e remover. Na edição mostra o clima legado como "Registro antigo". |
| `novo/contador-lista.tsx` | Componente local da lista de contadores (efetivo e equipamentos). |
| `[id]/page.tsx` | **Detalhe e impressão**: todos os dados, fotos com legenda, "Registrado por … / última alteração" e rodapé com duas linhas de assinatura. `@media print` (A4) esconde menu lateral, cabeçalho, menu inferior e toasts. Botões: Imprimir / salvar PDF, Editar, Excluir (os dois últimos só com permissão). |
| `[id]/botao-imprimir.tsx` | `window.print()`. |
| `[id]/editar/page.tsx` | **Edição**. Sem permissão, mostra o motivo e um link de volta. Inclui a obra do RDO mesmo que ela esteja concluída ou pausada. |
| `condicao-badge.tsx` | Selo colorido da condição de trabalho, usado na lista, no detalhe e na aba. |
| `page.tsx` (listagem) | Cada RDO leva ao detalhe. Mostra clima por turno ou legado, condição, nº de fotos e equipamentos. "+ RDO" preserva o filtro de obra. A regra de exclusão passou a usar `podeAlterarRdo`. |

### Aba da obra (`src/app/(app)/obras/[id]/abas/diario.tsx`)
- Tabela com data (link para o detalhe), clima, condição, total do efetivo, nº de fotos e autor. Mostra os 100 mais recentes e, se houver mais, um link para `/diario?obra=`.
- Resumo no topo: "N RDOs · X dias impraticáveis · Y dias parciais".
- O botão "Novo RDO" aponta para `/diario/novo?obra=<id>`.
- A assinatura `AbaDiario(props: AbaObraProps)` foi mantida.

### Validação
- `tsc --noEmit`, `eslint` nos meus arquivos e `vitest run` (108 testes): todos verdes.
- Playwright manual na porta 3104 (script fora do repo), com 27 verificações OK: criação com obra pré-selecionada, upload de 2 fotos, detalhe, modo print (menu e botões somem), PDF gerado, bloqueio de duplicata na criação e na edição, edição removendo e adicionando foto e trocando a data, RDO legado (clima antigo e função fora da lista preservada), aba da obra e, para CAMPO, RDO alheio bloqueado, RDO próprio fora do prazo bloqueado, RDO próprio recente editável e excluir pelo detalhe redirecionando.

## Decisões tomadas
1. **Prazo de 7 dias para o CAMPO.** O RDO é o registro do dia e serve de prova em discussões de prazo e de dias perdidos por chuva. Deixar o campo reescrever RDOs antigos sem limite enfraquece isso. Uma semana cobre o esquecimento normal (fim de semana, feriado). Depois disso a correção passa pelo escritório. O prazo conta a partir de `createdAt`, não de `data`, para não punir quem lança atrasado. É uma constante: basta mudar `PRAZO_EDICAO_CAMPO_DIAS`.
2. **Excluir segue a mesma regra de editar.** Antes, o CAMPO podia excluir o próprio RDO a qualquer tempo.
3. **O `clima` legado nunca é escrito**, nem é apagado na edição. Aparece na lista, na aba, no detalhe ("Clima (registro antigo)") e no formulário de edição.
4. **Efetivo e equipamentos aceitam itens fora da lista sugerida** (ex.: "Armador", "Retroescavadeira"), e a edição preserva funções antigas fora da lista (ex.: "Ajudante" dos dados importados). Itens repetidos são somados.
5. **PDF = impressão do navegador** (`@media print` + `window.print()`), sem dependência nova. O CSS de impressão fica num `<style>` da própria página de detalhe (não toquei em `globals.css`, `layout.tsx` nem `nav.tsx`). Ele esconde `body nav`, `body header` e `[data-sonner-toaster]`, o que é seguro porque a página de detalhe não usa `<nav>` nem `<header>` no conteúdo.
6. **Datas `@db.Date`**: o Prisma devolve meia-noite UTC. `formatarData` e `dataParaInput` usam o fuso local, então num servidor em `America/Sao_Paulo` o RDO apareceria no dia anterior. Nas minhas telas passo a data por `dataDoRdo` antes de formatar. Ver pedido 3.
7. Depois de salvar, o formulário vai para o detalhe do RDO (antes ia para `/diario`), para confirmar o que foi gravado e oferecer a impressão.

## Pendências
- **Arquivos de fotos removidas ficam órfãos em `./uploads`**: o `StorageDriver` não tem `remover`. O registro `Foto` é apagado; o arquivo, não. O mesmo já acontecia ao excluir um RDO (cascade).
- A legenda da foto (`Foto.legenda`) é exibida no detalhe, mas o formulário ainda não permite editá-la.
- A listagem `/diario` continua com `take: 60` e sem paginação.
- O CAMPO ainda vê RDOs de todas as obras: a permissão por obra fica para a Onda 2 (item 2.5). Quando ela existir, `permissaoRdo` deve receber também "obra permitida".
- Offline/PWA está fora de escopo, como decidido.
- Dados de teste no banco `gestao_obras_a4`: usuário `campo@obras.local` / `campo123` (CAMPO) e dois RDOs no Lote 01 (10/10 legado e 01/10 do campo).

## Pedidos ao integrador

### 1. `src/app/(app)/obras/[id]/abas/resumo.tsx`: "Últimos RDOs" com link para o detalhe e data corrigida
Adicionar o import:
```tsx
import { dataDoRdo } from "@/services/rdo";
```
E trocar o `<li>` da lista `ultimosRdos.map(...)` por:
```tsx
<li key={rdo.id} className="py-2 text-sm">
  <Link href={`/diario/${rdo.id}`} className="font-medium hover:underline">
    {formatarData(dataDoRdo(rdo.data))}
  </Link>
  {rdo.autor ? ` · ${rdo.autor.nome}` : ""} —{" "}
  <span className="text-muted-foreground">
    {rdo.atividades.length > 80 ? rdo.atividades.slice(0, 80) + "…" : rdo.atividades}
  </span>
</li>
```
Opcional: o botão "Ver todos" pode apontar para `/obras/${obra.id}?aba=diario` em vez de `/diario?obra=`.

### 2. `src/lib/storage.ts` (junto com o A9 / driver S3): remover arquivo
Adicionar `remover(url: string): Promise<void>` ao `StorageDriver`. Depois disso, em `diario/actions.ts`, chamar `storage.remover` para as URLs de `removerIds` em `atualizarRdo` e para as fotos do RDO em `excluirRdo`, logo depois de gravar no banco (falha ao apagar o arquivo não deve desfazer a gravação).

### 3. `src/lib/format.ts`: helper global para colunas `@db.Date`
O problema descrito em "Decisões 6" afeta todo campo `@db.Date` (inclusive `Etapa.inicioPrevisto`/`fimPrevisto` do A3). Sugestão: mover `dataDoRdo` para `lib/format.ts` como `dataCivil(d: Date): Date` e usar em todas as exibições e inputs dessas colunas. Até lá, `services/rdo.ts` mantém a sua versão.

### 4. Upload: nenhum formato novo é necessário
O formulário recomprime cada foto para JPEG no cliente (canvas) antes de enviar. HEIC do iPhone funciona quando o navegador consegue decodificar (o Safari consegue). Não há pedido para `api/upload`.
