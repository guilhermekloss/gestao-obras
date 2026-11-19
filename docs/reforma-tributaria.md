# Reforma tributária: IBS/CBS no app

O app lê o IBS e a CBS que os fornecedores destacam nas notas, calcula quanto a construtora
pode recuperar como crédito e mostra o custo da obra descontado desse crédito. Este documento
diz o que ele faz, o que não faz e como manter a tabela da Receita em dia.

## De onde vêm os dados

- **Notas:** o XML da NF-e e o da NFS-e nacional (grupo IBS/CBS). A foto ou o PDF de uma nota de
  serviço também viram NFS-e, mas sem o grupo IBS/CBS e sem chave de acesso guardada.
- **Classificação tributária (cClassTrib):** a tabela oficial da Receita Federal, carregada no banco
  por migration. Ela diz, para cada código, o CST, as reduções de alíquota, se o adquirente pode
  apropriar CBS e IBS e a quais NCM ou NBS o código vale.
- **Origem da tabela:** repositório `ReceitaFederal/calculadora-rtc-regime-regular`, licença MIT.
  O cabeçalho da migration `prisma/migrations/20261119120100_carga_classificacao_tributaria` cita a
  release 1.6.1 (commit 150cccb), a base de dados V0059 de 2026-09-30, com 164 classificações e
  4113 linhas de NCM/NBS.

## Regra de crédito

O crédito é o IBS/CBS destacado no item, quando todas as condições abaixo valem:

1. **A empresa está no regime regular** (tela Empresa, campo "Como a empresa apura IBS/CBS").
   Simples Nacional e "Não informado" não geram crédito: o imposto fica no custo.
2. **A compra é de 2027 em diante.** 2026 é o ano de teste: o imposto aparece na nota, mas não
   gera crédito.
3. **A classificação do item existe e vale na data de emissão.** Código ausente, desconhecido ou
   fora da vigência não gera crédito até alguém conferir.
4. **A classificação permite a apropriação.** Se ela só permite CBS ou só IBS, o crédito é parcial.
   Se não permite nenhum dos dois, o crédito é zero.

Outras regras:

- **vNFTot.** Quando a nota traz o IBS/CBS por fora (vNFTot maior que vNF), o total a pagar é o
  vNFTot. A diferença vira um item acessório "IBS/CBS destacados na nota (cobrados por fora)", para
  que a soma dos itens feche com o total. Esse valor é custo até virar crédito.
- **Crédito nunca deixa o custo negativo.** Se o crédito passar do total, vale zero de custo, e o
  erro fica no dado da nota.
- **Notas sem destaque** (anteriores à reforma, isentas, imunes ou lançadas à mão) não geram crédito.

## Onde aparece

| Tela | O que mostra |
|---|---|
| Orçamento da obra | Crédito a recuperar, custo bruto e custo líquido. O modo líquido troca o "Realizado" de cada etapa. |
| Resumo da obra | Crédito a recuperar e custo líquido da obra. |
| Dashboard | Card "Crédito IBS/CBS a recuperar" (com o nome da obra, quando há filtro). Aparece só quando já há notas com IBS/CBS. |
| Curva ABC de insumos | Opção "Líquido de IBS/CBS", só quando há crédito a recuperar. |
| Material (`/materiais/<id>`) | Card "Quanto custa de verdade por fornecedor": preço médio por unidade e custo efetivo (preço menos crédito), por período de 6, 12 ou 24 meses. |
| Fornecedor | Selo do regime (Simples, normal, MEI ou não identificado) e aviso sobre o crédito das compras dele. |
| Detalhe da nota (`/notas/<id>`) | Card IBS/CBS com cada item: base, alíquotas, destacado e crédito, e a conferência. |
| Prévia do import de XML | Conferência do IBS/CBS antes de importar, para NF-e e NFS-e. |
| Empresa | Campo para informar como a empresa apura IBS/CBS. Só ADMIN. |

Esses números são lidos por cálculo no servidor (`src/services/tributacao/`). A tela não calcula
crédito por conta própria.

## Conferência tributária

A conferência compara o que o fornecedor destacou com a tabela da Receita. Ela só **avisa**:
nada disso impede importar ou salvar a nota. Os avisos ficam em dois grupos:

**Vale conferir com o fornecedor** (atenção):

- classificação não informada, inexistente ou fora da vigência na data da nota;
- CST da nota diferente do previsto pela classificação;
- NCM ou NBS que não estão entre os produtos e serviços da classificação;
- redução de alíquota diferente da prevista;
- base × alíquota que não bate com o valor destacado (1 centavo de tolerância por tributo);
- soma dos itens diferente do total da nota (base, CBS ou IBS);
- fornecedor do regime normal que não destacou IBS/CBS, a partir de 2027.

**Para saber** (informação):

- classificação que não dá crédito, com o valor que fica no custo;
- classificação que dá crédito só de um dos tributos;
- fornecedor do regime normal sem destaque em 2026 (ano de teste).

A soma dos totais (vNF/vNFTot) só é conferida na prévia do XML. A nota já salva não guarda esses
totais, então a conferência da tela da nota não os compara.

## Limitações conhecidas

- **Crédito presumido do adquirente** não vem no documento. Quando a classificação prevê, o app só
  sinaliza; não soma esse crédito.
- **Desembolso e fluxo de caixa** (contas a pagar, fluxo mensal, desembolso previsto × realizado)
  continuam brutos: são as parcelas, sem o crédito. Os alertas do dashboard também seguem brutos.
  O custo líquido vale só onde a tela diz "líquido".
- **Simples Nacional e fornecedor do Simples:** o preço dele costuma sair "cheio", porque destaca
  pouco ou nada. O custo efetivo mostra isso com aviso.
- **NFS-e lida por foto ou PDF** não tem chave de acesso guardada. A conferência e o crédito dela
  dependem só dos valores lidos.
- **Regras de 2026** são as de ano de teste. Se a Receita mudar o calendário, a regra de início do
  crédito (`INICIO_CREDITO_IBS_CBS` em `src/services/tributacao/credito.ts`) precisa ser revista.

## Como atualizar a tabela a cada release da Receita

A tabela não é editada à mão. O script refaz a montagem da base da Receita e gera o SQL de carga:

```bash
git clone https://github.com/ReceitaFederal/calculadora-rtc-regime-regular /caminho/rtc
npx tsx scripts/tributacao/gerar-carga-classificacao.ts /caminho/rtc \
  --saida prisma/migrations/<timestamp>_carga_classificacao_tributaria/migration.sql
```

Depois:

1. Use um `<timestamp>` maior que o da última migration da pasta `prisma/migrations/`.
2. Confira o cabeçalho do SQL: release, commit e data da base.
3. Rode `npx prisma migrate dev` e `npx vitest run`. Os testes de classificação e de conferência
   pegam mudanças de formato.
4. Abra um PR com a migration nova.

**Nunca edite uma migration que já foi para a `main`.** A migration de uma release nova apaga e
recarrega a tabela inteira; a antiga fica como histórico.
