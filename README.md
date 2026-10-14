# Gestão de Obras

Plataforma web (responsiva/PWA) de gestão de obras: lançamentos (NF, recibo, folha, guia) com rateio entre obras, leitura automática da nota por foto, PDF ou XML da NF-e, contas a pagar, diário de obra mobile com impressão, cronograma com Gantt e curva S, orçamento vs. realizado com curva ABC e alertas, e dashboard. Substitui as planilhas de quantitativo e financeiro.

Roadmap e organização do trabalho: [`docs/plano-evolucao.md`](docs/plano-evolucao.md).

Documentação completa do produto: pasta `../Gestão de Obras/` (vault Obsidian).

## Rodando local

```bash
docker compose up -d        # PostgreSQL
npm install
npx prisma migrate dev      # cria as tabelas
npm run db:seed             # admin + 6 lotes com etapas padrão
npm run dev                 # http://localhost:3000
```

Leitura automática de foto/PDF de nota: defina `ANTHROPIC_API_KEY` no `.env` (opcional — sem ela, XML e preenchimento manual funcionam e foto/PDF ficam só anexados). Após a leitura, um pop-up de conferência mostra todos os dados ao lado do documento e só grava após a confirmação do usuário; `CNPJS_EMPRESA` (opcional) confere o destinatário da nota. Detalhes em [`docs/leitura-nota-fiscal.md`](docs/leitura-nota-fiscal.md).

Login inicial: `admin@obras.local` / `admin123` (troque na tela Usuários).

Para testar no celular: acesse `http://<IP-da-máquina>:3000` na mesma rede Wi-Fi e use "Adicionar à tela inicial".

## Testes

```bash
npm test                # Vitest — services (parcelas, rateio, fluxo, importação)
npx playwright test     # e2e — fluxo crítico: NF → pagar → custo na obra
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 + shadcn/ui · PostgreSQL + Prisma 6 · Auth.js v5 · Recharts. Dinheiro em centavos (Int); percentuais em basis points. Regras de negócio em `src/services/` (puras, testadas).

## Estrutura

- `src/app/(app)/` — módulos: obras (página em abas: `obras/[id]/abas/`), fornecedores, notas (lançamentos com envio único de foto/PDF/XML em `nova/` + `importar-xml`), contas, diario, cronograma (Gantt, curva S, Avanço), orcamento (+ `abc`), usuarios, dashboard (+ `alertas`, `widgets/`), importar (migração CSV — fora do menu), medicoes (redireciona para cronograma)
- `src/services/` — parcelas, rateio, financeiro, obra, custos, obras (seleção de obras ativas), importacao, dependencia, cronograma, rdo, analises (curva ABC, alertas), nfe-xml, leitura-documento (conferência da nota lida) + leitor-ia (Claude: foto/PDF → dados)
- `src/lib/` — prisma, auth (`exigirPapel`), acao (`acaoDeEscrita` — seam das server actions), format (moeda/data/percentual BR), storage, imagem (reduz a foto antes do upload)
- `prisma/` — schema, seed, `teste-fluxo.ts` (dados de demonstração)

## Papéis

| Papel | Acesso |
|---|---|
| ADMIN | tudo + usuários |
| ESCRITORIO | NFs, financeiro, orçamento, importação |
| CAMPO | RDO (edita/exclui o próprio por 7 dias), avanço no cronograma, obras — sem valores financeiros (bloqueado no servidor) |

## Pendências conscientes

- Service worker (cache offline) não instalado — o PWA é instalável via manifest; Serwist fica para quando o deploy for definido.
- Rateio é por nota (aplicado a todos os itens) — o modelo de dados garante isso (`RateioNota` pertence à `NotaFiscal`, não ao item). Para destinar um item a outra obra, lance em uma nota separada.
- Editar um lançamento preserva as parcelas pagas cujo valor e vencimento não mudaram; alterar ou remover uma parcela paga a reabre/remove, com confirmação.
- Lançamentos sem NF (recibo, folha, guia, outro) recebem número automático por fornecedor quando ficam em branco: `REC-0001`, `FOL-0001`, `GUIA-0001`, `DOC-0001`.
- Datas em colunas `@db.Date` (RDO, datas previstas de etapa) e datas gravadas à meia-noite UTC podem aparecer um dia antes num servidor fora de UTC — rodar o servidor em UTC até a padronização (ver plano, Onda 2).
- Fotos removidas de um RDO ficam órfãs em `./uploads` até o driver de storage ganhar `remover` (Onda 2, junto com S3/R2).
- Importador espera o formato documentado na tela Importar — valide com as planilhas reais exportadas em CSV.
