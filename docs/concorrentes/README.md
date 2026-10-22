# Concorrentes

Uma pasta por concorrente estudado, com a análise original, a comparação com o nosso código e o que
ficou para depois. O plano do produto continua em [`plano-evolucao.md`](../plano-evolucao.md); aqui fica
a referência que alimenta esse plano.

## Para que serve

**Antes de implementar uma funcionalidade, consulte o concorrente.** Em especial:

1. Abra o `comparativo.md` de cada concorrente e procure a funcionalidade. Ele diz como ela funciona
   lá, como funciona aqui (com o arquivo do nosso código) e o que foi decidido.
2. Se ela estiver no `backlog.md`, leia a ficha: pré-requisitos, esforço e o que já temos de base.
3. Para as regras de negócio de lá (fórmulas, travas, estados), vá à análise original. Copiar o que
   funciona e evitar os problemas de UX já anotados sai mais barato que descobrir de novo.
4. Ao entregar, atualize o `comparativo.md` (a decisão vira "feito") e tire o item do `backlog.md`.

## Concorrentes

| Concorrente | Situação | Público | Pasta |
|---|---|---|---|
| **Cofield** | Analisado em 21–22/10/2026 (conta de teste + central de tutoriais) | Construtoras e incorporadoras; foco em planejamento e Last Planner | [`cofield/`](cofield/README.md) |
| **Sienge** (+ GO, Prevision, Construpoint) | Candidato | Médias e grandes (GO: pequenas) | — |
| **Obra Prima** | Candidato | Pequenas e médias | — |
| **Vobi** | Candidato | Reforma e arquitetura | — |
| **Mais Controle** | Candidato | Pequenas e médias | — |
| **OrçaFascio / Volare** | Candidato | Orçamentistas, obra pública | — |
| **Procore** | Candidato | GCs médios e grandes (EUA) | — |
| **Buildertrend** | Candidato | Residencial (EUA) | — |
| **Fieldwire / Autodesk Build** | Candidato | Campo | — |

Os candidatos vêm do benchmark resumido em [`plano-evolucao.md`](../plano-evolucao.md#1-benchmark-resumido).
Lá está o que cada um tem de relevante, em uma linha. Um candidato ganha pasta quando for analisado a
fundo.

## Modelo para um concorrente novo

```
docs/concorrentes/<nome>/
  README.md                 ficha: o que é, público, preço, fontes e data; mapa dos arquivos
  analise-<fonte>.md        análise original, na íntegra (uma por fonte: plataforma, site, demo...)
  comparativo.md            funcionalidades comuns e exclusivas, com a decisão de cada uma
  backlog.md                o que não entra agora, priorizado
```

- **`README.md`**: uma tela. O que é, para quem, quanto custa, de onde vieram as informações e em que
  data. Termina com o mapa dos arquivos da pasta.
- **`analise-*.md`**: a fonte primária, sem edição. Se a análise for refeita, entra um arquivo novo
  com a data no nome; o antigo fica para comparar.
- **`comparativo.md`**: para cada funcionalidade em comum, como funciona lá, como funciona aqui (com o
  caminho do arquivo no nosso código), o que cada lado tem a mais e a decisão (*agora*, com o PR, ou
  *backlog*). Depois, o que só existe lá e o que só existe aqui. Antes de escrever "aqui faz X",
  confira no código.
- **`backlog.md`**: abre com uma tabela-resumo ordenada por prioridade. Cada item ganha uma ficha com:
  o que é lá (link para a seção da análise), o que já temos de base, pré-requisitos, esforço (P/M/G),
  prioridade e encaixe nas ondas do [`plano-evolucao.md`](../plano-evolucao.md#3-backlog-priorizado).

## Grau de certeza

Toda informação sobre o concorrente leva uma destas marcas, em texto ou numa coluna:

| Marca | Quando usar |
|---|---|
| **confirmado** | Visto na tela do produto (conta de teste, demonstração, captura de tela) |
| **divulgado** | Dito pelo próprio concorrente: site, tutorial, post, material de venda. Pode não estar pronto |
| **inferido** | Deduzido do nome do módulo, de um campo de configuração ou da prática de mercado. Confirmar antes de usar como base de decisão |

Quando a marca não estiver explícita numa linha, vale a do cabeçalho da seção ou a regra da ficha
do concorrente.
