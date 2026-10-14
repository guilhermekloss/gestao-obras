# Handoff — A2 NF-e (Onda 1, item 1.2)

Importação do XML da NF-e: o usuário envia o `.xml`, vê a prévia (fornecedor, itens, total e
parcelas), define o rateio entre obras e confirma. A nota é criada já com `chaveNfe`.

## O que foi feito

### Rotas
- **`/notas/importar-xml`** (ADMIN e ESCRITORIO), página nova.

### Arquivos (todos novos)
| Arquivo | Conteúdo |
|---|---|
| `src/services/nfe-xml.ts` | `parseNfeXml(xml)` puro → `{ ok: true, nfe }` ou `{ ok: false, erro }`. Também exporta `parcelasDaNfe`, `unitarioCoerente`, `decimalParaInteiro`, `mapearFormaPagto`, `formatarDocumento` e `variantesDocumento`. |
| `src/services/__tests__/nfe-xml.test.ts` | 31 testes |
| `src/services/__tests__/fixtures/nfe-1-item.xml` | `nfeProc` com 1 item, PIX e sem duplicata |
| `src/services/__tests__/fixtures/nfe-varios-itens.xml` | `NFe` sem envelope, com 4 itens, frete, IPI e 3 duplicatas, e os casos de arredondamento |
| `src/services/__tests__/fixtures/nfe-invalida.xml` | XML truncado |
| `src/app/(app)/notas/importar-xml/page.tsx` | Página (server): `exigirPapel` + `listarObrasParaRateio` |
| `src/app/(app)/notas/importar-xml/importar-xml-form.tsx` | Client: lê o arquivo, faz a prévia, o rateio, as parcelas e envia |
| `src/app/(app)/notas/importar-xml/previa-nfe.tsx` | Cabeçalho, tabela de itens com o tipo editável e o aviso de nota existente com link |
| `src/app/(app)/notas/importar-xml/actions.ts` | `importarNfe` (via `acaoDeEscrita`) e a leitura `consultarSituacaoImportacao` (via `exigirPapel`) |

### Fluxo da action `importarNfe`
1. Reprocessa o XML no servidor, sem confiar na prévia do client. Do client vêm só os tipos dos itens, o rateio e as parcelas.
2. Valida com `rateioSchema`/`parcelaSchema` (de `schemas/nota.ts`), `validarRateio` e `validarParcelas` contra o `vNF`.
3. Recusa uma chave já importada. Recusa também a mesma NF (fornecedor + número) lançada à mão antes, porque o `@@unique` recusaria. Nos dois casos devolve `notaExistenteId`, e a tela mostra **"Abrir a nota"**, que leva a `/notas/<id>`. A tela também consulta a chave assim que o arquivo é lido, então o aviso aparece antes de preencher o rateio.
4. Fornecedor: procura pelo CNPJ/CPF com e sem máscara. Se não achar, cria com `fornecedorSchema` + `criarFornecedorValidado` (nome = `xNome`, CNPJ mascarado, fone).
5. Salva o próprio XML como anexo da nota (`storage.salvar`, extensão `.xml`).
6. Numa transação, cria a nota (`chaveNfe`, `tipoDocumento: NF`, `obs: "Importada do XML da NF-e (série X)"`), os rateios, os itens e as parcelas.
7. `revalidatePath("/notas")`, `revalidatePath("/contas")` e `revalidatePath("/fornecedores")` se criou fornecedor. Depois faz `redirect("/notas/<id>")`.

### Verificação
- `npx tsc --noEmit` e `npx eslint` nos arquivos novos: sem erros. `npx vitest run`: 9 arquivos, 108 testes, todos verdes.
- Testado no navegador (porta 3102, Playwright, desktop e 390 px):
  - XML inválido;
  - prévia com fornecedor novo;
  - rateio 50/50 + troca de tipo → redireciona para `/notas/<id>`;
  - reimportação recusada com link;
  - NF de 1 item sem duplicata (parcela única na emissão);
  - fornecedor com CNPJ só em dígitos é encontrado;
  - NF lançada à mão recusada com link.
- Conferido no banco que os itens, as parcelas e os rateios fecham. Os dados de teste foram apagados depois.

## Decisões tomadas

- **Arredondamento: o total de cada item é sempre `calcularTotalItem(qtde, unitCents, descontoCents)`.**
  - Os valores do XML são convertidos por string, com arredondamento meio-para-cima, sem ponto flutuante.
  - `qCom` (4 casas) é arredondada para 3 casas.
  - `vUnCom` (até 10 casas) vira centavos. Quando qtde × unitário não reproduz o `vProd` (unitário com frações de centavo), o unitário sobe para o menor valor em centavos que alcança `vProd`, e o excesso entra no **desconto** do item. Assim o total do item é exatamente `vProd − vDesc`. Exemplo: 3 × R$ 0,3333 vira unitário R$ 0,34 com R$ 0,02 de desconto. Se o ajuste passa de R$ 0,10, a prévia mostra um aviso.
- **A soma dos itens fecha em `vNF`:**
  - frete (`vFrete`) vira o item "Frete (NF-e)", tipo FRETE;
  - seguro, outras despesas, IPI, IPI devolvido, ST, FCP-ST e II viram um item ENCARGO;
  - uma diferença positiva restante vira o item "Ajuste para o total da NF-e";
  - uma diferença negativa (ex.: ICMS desonerado) entra como desconto no maior item.

  Com isso, custo por obra (itens × rateio) = financeiro (parcelas), e a nota não cai no aviso "soma dos itens difere do total" do `salvarNota` se for editada depois.
- **Data de emissão:** usa os 10 primeiros caracteres de `dhEmi`, a data no fuso do emissor, como impressa no DANFE. Ela é gravada com `inputParaData` (meio-dia local), assim como os vencimentos.
- **Forma de pagamento:** usa o `detPag` de maior `vPag`, ignorando `tPag 90` ("sem pagamento"). O mapeamento é 01→DINHEIRO, 03→CARTAO, 04→DEBITO, 15→BOLETO, 16/18→TRANSFERENCIA e 17/20→PIX. Qualquer outro código vira BOLETO.
- **Parcelas:** vêm das duplicatas (`numero` = 1..N na ordem do XML). Sem `cobr`, é uma parcela única com o `vNF` e vencimento na emissão. Na tela os valores e as datas são **editáveis**, porque às vezes Σ`vDup` ≠ `vNF`, e nesse caso a prévia avisa. O servidor valida com `validarParcelas`.
- **Itens não são editáveis** na importação, só o tipo (default MATERIAL; frete e encargos já vêm sugeridos). Depois de importada, a nota pode ser editada normalmente em `/notas/<id>`.
- **Segurança:**
  - XML com `<!DOCTYPE` é recusado, porque NF-e nunca tem e isso evita expansão de entidades;
  - o arquivo é limitado a 900 KB no client, porque o limite padrão do corpo de server action é 1 MB;
  - o anexo `.xml` é servido por `/api/fotos` como `application/octet-stream`, ou seja, baixa sem renderizar (ver pedido 3).
- **Redirect:** a action usa `acaoDeEscrita` sem a opção `revalidar` e chama `revalidatePath` + `redirect` no handler, como o `excluirObra` descrito no comentário de `lib/acao.ts`.
- O fornecedor é criado fora da transação da nota, porque `criarFornecedorValidado` usa o `prisma` global. Se a gravação da nota falhar depois, o fornecedor fica cadastrado, o que é inofensivo: a próxima tentativa o encontra pelo CNPJ.

## Pendências

- NF-e de serviço conjugada (ISSQN, `vServ`) e NF-e de devolução/complementar não têm tratamento específico. Elas caem na regra genérica de fechar no `vNF` (item de ajuste ou desconto).
- O XML de **evento** (cancelamento) é recusado como "não é NF-e". Não há fluxo para cancelar uma nota importada a partir do evento.
- Importação em lote (vários XMLs de uma vez) ficou fora do escopo.

## Pedidos ao integrador

### 1. Link "Importar XML" na listagem `/notas` (`src/app/(app)/notas/page.tsx`, do A1)

Trocar o import de ícones:
```tsx
import { Paperclip, Plus } from "lucide-react";
```
por:
```tsx
import { FileCode2, Paperclip, Plus } from "lucide-react";
```
E trocar o botão do cabeçalho:
```tsx
        <Button render={<Link href="/notas/nova" />}>
          <Plus className="size-4" /> Nova NF
        </Button>
```
por:
```tsx
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/notas/importar-xml" />}>
            <FileCode2 className="size-4" /> Importar XML
          </Button>
          <Button render={<Link href="/notas/nova" />}>
            <Plus className="size-4" /> Nova NF
          </Button>
        </div>
```

### 2. Link em `/notas/nova` (`src/app/(app)/notas/nova/page.tsx`, do A1)

Adicionar os imports:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileCode2 } from "lucide-react";
```
E trocar:
```tsx
      <h1 className="text-2xl font-semibold">Nova nota fiscal</h1>
```
por:
```tsx
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Nova nota fiscal</h1>
        <Button variant="outline" size="sm" render={<Link href="/notas/importar-xml" />}>
          <FileCode2 className="size-4" /> Importar XML da NF-e
        </Button>
      </div>
```

### 3. (Opcional) `/api/fotos/[nome]/route.ts`: **não** mapear `xml` para `application/xml` sem `Content-Disposition: attachment`

Hoje o anexo `.xml` sai como `application/octet-stream` e é baixado. Servir como `application/xml` na mesma origem permitiria XSS via XHTML embutido. Se quiserem um tipo explícito, o trecho seguro é:
```ts
const MIME: Record<string, string> = {
  // ...existentes...
  xml: "application/xml",
};
// e, no NextResponse, para xml:
// "Content-Disposition": "attachment",
```

### 4. (Opcional) Limite de corpo de server action (`next.config.ts`)

Para aceitar NF-e muito grandes (mais de 900 KB, centenas de itens), adicionar o bloco abaixo e subir `MAX_BYTES_XML` em `importar-xml-form.tsx`:
```ts
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
```

### 5. Para o A1 (só registro, sem bloqueio)

- `nota-form.tsx` (`FORMAS`) e `notas/page.tsx` (`FORMA_LABELS`) ainda não listam `TRANSFERENCIA`/`DINHEIRO`. Uma NF-e importada com essas formas, aberta para edição, mostraria a forma errada no select, e salvar a trocaria. O A1 já está incluindo os dois valores no item 1.1. Basta confirmar no merge.
- `salvarNota` grava `dataCompra` com `new Date("aaaa-mm-dd")` (meia-noite UTC), enquanto a importação usa `inputParaData` (meio-dia local). Ambas exibem o mesmo dia com o servidor em UTC. Vale padronizar em `inputParaData`.
- `salvarNota` não altera `chaveNfe` na edição (fica fora de `dadosNota`), então a chave é preservada. **Manter assim** ao mexer na action.
- (Sugestão) Em `notas/[id]/page.tsx`, mostrar a chave de acesso quando `nota.chaveNfe` existir, por exemplo `<p className="font-mono text-xs text-muted-foreground">Chave NF-e {nota.chaveNfe}</p>` abaixo do título.
