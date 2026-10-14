# Handoff — A1 Financeiro (Onda 1)

Branch: `worktree-agent-a068574b9c2b7322e` (sobre `1a0dd1d`, Fase 0).

## O que foi feito

### 1. Lançamentos sem NF (recibo, folha, guia, outro)

- **Formulário** (`/notas/nova` e `/notas/[id]`): novo campo **Tipo de documento**
  (Nota fiscal · Recibo · Folha de pagamento · Guia/imposto · Outro).
  - NF: "Nº da NF *" obrigatório, como antes.
  - Demais tipos: "Nº do documento" opcional, com placeholder "Automático". Se ficar em
    branco, o servidor gera o número (ver Decisões).
  - Ao trocar o tipo, as linhas de item **ainda sem descrição** recebem um tipo de item
    sugerido: Guia → Encargo; Recibo/Folha → Serviço; NF/Outro → Material.
  - Fornecedor continua obrigatório (o texto de ajuda diz que pode ser o próprio prestador).
  - Rótulos: "Dados da nota" → "Dados do lançamento", "Data da compra" → "Data",
    "Arquivo da nota" → "Arquivo do documento", toast "Lançamento salvo", título
    "Novo lançamento" / "Editar <tipo> <número>". O botão de criar continua
    **"Lançar nota"** para NF (o e2e usa esse nome) e vira "Lançar" nos demais tipos.
- **Listagem `/notas`**: título "Lançamentos", botão "Novo lançamento", coluna
  "Documento" com **badge do tipo** + número, e filtro **Tipo** (`?tipo=RECIBO` etc.).
- **Servidor** (`notas/actions.ts` → `salvarNota`):
  - "NF exige número" é validado aqui (via `exigeNumero`), não no schema (ver Decisões).
  - Número gerado dentro da transação quando o tipo não é NF e o número veio vazio.
  - Número repetido no mesmo fornecedor virou **bloqueio** (antes era aviso) — ver Decisões.

### 2. Formas de pagamento TRANSFERENCIA e DINHEIRO

- Labels centralizados em `FORMA_PAGTO_LABELS` (`services/financeiro.ts`), usados no
  formulário e na listagem de `/notas`.
- `gerarParcelas`: **DINHEIRO** é à vista (1 parcela na data, como PIX/Débito);
  **TRANSFERÊNCIA** aceita parcelas — 1ª na data do documento, demais mês a mês (caso típico:
  pagar mão de obra em várias transferências).

### 3. Preservar pagamentos ao editar

- `services/parcelas.ts`:
  - `reconciliarParcelas(antigas, novas)` — função pura. Casa por `numero`; para cada parcela
    decide `manter` (valor e vencimento iguais → status/pagaEm preservados), `atualizar`
    (mudou → volta a ABERTA) ou `criar`; lista as `removidas` e as `pagasAfetadas`
    (PAGA alterada ou removida). Rejeita número de parcela repetido.
  - `avisoParcelasPagas(afetadas)` — texto do aviso; `null` quando nenhuma paga é afetada.
- `salvarNota` não apaga mais as parcelas: remove só as removidas, atualiza só as alteradas
  e cria as novas. Parcelas `manter` nem são tocadas.
- O aviso ao usuário só aparece quando uma parcela **PAGA** é alterada ou removida.
  Os avisos (soma dos itens ≠ total, parcelas pagas) agora saem **numa única confirmação** —
  antes, confirmar o primeiro aviso pulava os demais em silêncio, porque `forcar` vale para todos.
- No formulário de edição, cada parcela paga mostra o badge **"Paga"**, ou
  **"Paga · volta a abrir"** quando foi alterada; as pagas removidas aparecem numa nota
  abaixo da lista. Usa a mesma função pura (`situacaoParcelasPagas` em `nota-form-model.ts`).
- O banner da tela de edição foi reescrito para a nova regra.

### 4. Contas a pagar

- Coluna "NF" → **"Documento"**, com badge do tipo + número.
- Filtro **Tipo** no formulário de filtros; os links das visões (Hoje, Semana...) preservam
  obra, fornecedor e tipo.

### Correção extra

- `nota-form.tsx`: "Soma dos itens" ficava parada em R$ 0,00 (`useMemo` sobre o array de
  `watch("itens")`, que o RHF muta sem trocar a referência). Agora é calculada a cada render.

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/schemas/nota.ts` | `tipoDocumentoSchema`; `tipoDocumento` opcional; `numero` sem `min(1)` (só `trim`) |
| `src/services/financeiro.ts` | `TIPOS_DOCUMENTO`, labels de tipo/forma, `PREFIXO_DOCUMENTO`, `exigeNumero`, `parseTipoDocumento`, `gerarNumeroDocumento` |
| `src/services/parcelas.ts` | TRANSFERENCIA/DINHEIRO em `gerarParcelas`; `reconciliarParcelas`, `avisoParcelasPagas` |
| `src/app/(app)/notas/actions.ts` | `salvarNota` com tipo, número automático, bloqueio de número repetido, reconciliação de parcelas e avisos agrupados |
| `src/app/(app)/notas/nota-form.tsx`, `nota-form-model.ts` | campo tipo, número condicional, novas formas, indicador de parcela paga, rótulos |
| `src/app/(app)/notas/page.tsx`, `nova/page.tsx`, `[id]/page.tsx` | badge, filtro e rótulos |
| `src/app/(app)/contas/page.tsx`, `contas-client.tsx` | coluna Documento e filtro Tipo |
| `src/services/__tests__/parcelas.test.ts`, `financeiro.test.ts`, `src/app/(app)/notas/__tests__/nota-form-model.test.ts` | testes novos |

Validação: `tsc --noEmit` limpo; `eslint` sem erros (2 warnings já existentes em
`nota-form.tsx`: import `Textarea` sem uso e o aviso do React Compiler sobre `watch`);
`vitest` 104/104. Fluxo verificado no navegador (porta 3101, banco `gestao_obras_a1`) com 25
checagens: recibo sem número → REC-0001 e REC-0002; NF sem número bloqueada; badge e filtro
em `/notas` e `/contas`; editar NF com parcela paga sem mexer nela → continua paga, sem aviso;
alterar parcela aberta → sem aviso; alterar a paga → aviso e reabertura; NF repetida e recibo
com número manual repetido bloqueados.

## Decisões tomadas

1. **Numeração automática: `<PREFIXO>-0001`, sequencial por fornecedor e por tipo.**
   Prefixos: Recibo `REC`, Folha `FOL`, Guia `GUIA`, Outro `DOC`. O próximo número é o
   **maior existente + 1** (não a contagem), para que excluir um lançamento no meio da
   sequência não repita um número ainda em uso. É por fornecedor porque o banco já tem
   `@@unique([fornecedorId, numero])`: assim o número gerado nunca colide e não foi preciso
   mexer no schema. Uma corrida rara (dois lançamentos simultâneos do mesmo fornecedor) cai no
   P2002 e vira mensagem amigável pedindo para salvar de novo.
2. **Número repetido é bloqueio, não aviso.** O aviso "NF duplicada → salvar mesmo assim?"
   nunca funcionou: com a unicidade `(fornecedorId, numero)`, "salvar mesmo assim" estourava
   erro do Prisma. Agora: NF → "Já existe a NF X deste fornecedor..."; demais tipos →
   "Já existe um lançamento nº X... deixe em branco para gerar automaticamente". O conceito
   de "NF duplicada" só aparece para tipo NF, como pedido.
3. **`NotaInput` compatível:** `tipoDocumento` é **opcional** (ausente = NF), sem `.default()`,
   para não virar campo obrigatório no tipo inferido. `numero` continua `string` obrigatória
   no tipo (pode ser `""`).
4. **Sem `.refine` no `notaSchema`:** o Zod 4 recusa `.extend()`/`.pick()` em objetos com
   refinamento, e o A2 pode querer estender o schema. A regra "NF exige número" fica em
   `salvarNota` (e no `validate` do formulário).
5. **Comparação de vencimento na reconciliação** é feita no formato do formulário
   (`aaaa-mm-dd`, via `dataParaInput`), o mesmo que a tela de edição usa para preencher os
   campos — uma parcela não tocada volta idêntica e é mantida sem reescrita.
6. **Parcela paga alterada volta a ABERTA** (`pagaEm = null`): o pagamento registrado era
   de outro valor/data. Parcela aberta alterada é só atualizada, sem aviso.
7. Labels de tipo/forma ficaram em `services/financeiro.ts` (e não em `lib/`, que é
   proibido) para serem compartilhados entre `/notas` e `/contas`. O integrador pode movê-los.

## Pendências

- **Fuso das datas:** `salvarNota` grava `vencimento`/`dataCompra` com `new Date("aaaa-mm-dd")`
  (meia-noite UTC), mas a tela lê com `dataParaInput` (hora local). Num servidor em
  America/Sao_Paulo, a data exibida pode voltar um dia, e cada edição que regrava a parcela
  "anda" um dia. A reconciliação mitiga o problema (parcelas não tocadas não são regravadas),
  mas a correção completa é gravar com `inputParaData` (meio-dia local) e migrar os dados
  existentes — não fiz para não mudar a semântica das datas no meio da onda.
- A coluna "Documento" em `/contas` segue o padrão antigo da coluna "NF" e fica oculta no
  celular (`md:table-cell`).
- `dashboard`, `custos.ts` e o relatório da obra não distinguem tipo de documento — todo
  lançamento entra no custo, que é o objetivo. Se o A5 quiser quebrar o custo por tipo
  (ex.: "mão de obra sem NF"), basta ler `NotaFiscal.tipoDocumento`; os labels estão em
  `TIPO_DOCUMENTO_LABELS`/`TIPO_DOCUMENTO_BADGE`.

## Pedidos ao integrador

1. **Menu — `src/components/nav.tsx`, linha 32:** renomear o rótulo (a rota continua `/notas`):
   ```diff
   -  { href: "/notas", label: "Notas fiscais", icon: ReceiptText, papeis: ["ADMIN", "ESCRITORIO"], mobile: true },
   +  { href: "/notas", label: "Lançamentos", icon: ReceiptText, papeis: ["ADMIN", "ESCRITORIO"], mobile: true },
   ```
2. **`src/app/(app)/fornecedores/[id]/page.tsx`** (rótulos, opcional):
   - linha 139: `titulo="Notas fiscais"` → `titulo="Lançamentos"`;
   - linha 271: `<TableHead>NF</TableHead>` → `<TableHead>Documento</TableHead>`.
3. **`README.md`, seção "Pendências conscientes"** — trocar o item
   > Editar uma NF com parcelas pagas recria as parcelas como abertas — a ação pede confirmação antes de perder o registro de pagamento.

   por:
   > Editar um lançamento preserva as parcelas pagas cujo valor e vencimento não mudaram; alterar ou remover uma parcela paga a reabre/remove, com confirmação.

   e, em funcionalidades, citar os tipos de documento (NF, recibo, folha, guia, outro) com
   número automático `REC-0001`, `FOL-0001`, `GUIA-0001`, `DOC-0001` por fornecedor.
4. **Para o A2 (NF-e):** ao montar `NotaInput` a partir do XML, pode omitir `tipoDocumento`
   (vale NF) ou passar `"NF"`. Se chamar `salvarNota`, NF sem número é recusada e número
   repetido no fornecedor agora é **erro**, não aviso. `notaSchema` continua um `z.object`
   sem refinamento, então `.extend({ chaveNfe: ... })` funciona.
5. **e2e (`e2e/fluxo-critico.spec.ts`)** continua válido sem mudanças (botão "Lançar nota",
   `#numero`). Sugestão de caso novo: lançar recibo sem número → aparece `REC-0001` em `/notas`.
