# Gestão de Obras

Plataforma web (responsiva/PWA) de gestão de obras: notas fiscais com rateio entre obras, contas a pagar, diário de obra mobile, orçamento vs. realizado, medições e dashboard. Substitui as planilhas de quantitativo e financeiro.

Documentação completa do produto: pasta `../Gestão de Obras/` (vault Obsidian).

## Rodando local

```bash
docker compose up -d        # PostgreSQL
npm install
npx prisma migrate dev      # cria as tabelas
npm run db:seed             # admin + 6 lotes com etapas padrão
npm run dev                 # http://localhost:3000
```

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

- `src/app/(app)/` — módulos: obras, fornecedores, notas, contas, diario, medicoes, orcamento, importar, usuarios, dashboard
- `src/services/` — parcelas, rateio, financeiro, obra, custos, obras (seleção de obras ativas), importacao, dependencia
- `src/lib/` — prisma, auth (`exigirPapel`), acao (`acaoDeEscrita` — seam das server actions), format (moeda/data/percentual BR), storage
- `prisma/` — schema, seed, `teste-fluxo.ts` (dados de demonstração)

## Papéis

| Papel | Acesso |
|---|---|
| ADMIN | tudo + usuários |
| ESCRITORIO | NFs, financeiro, orçamento, importação |
| CAMPO | RDO, medições, obras — sem valores financeiros (bloqueado no servidor) |

## Pendências conscientes

- Service worker (cache offline) não instalado — o PWA é instalável via manifest; Serwist fica para quando o deploy for definido.
- Rateio é por nota (aplicado a todos os itens) — o modelo de dados garante isso (`RateioNota` pertence à `NotaFiscal`, não ao item). Para destinar um item a outra obra, lance em uma nota separada.
- Editar uma NF com parcelas pagas recria as parcelas como abertas — a ação pede confirmação antes de perder o registro de pagamento.
- Importador espera o formato documentado na tela Importar — valide com as planilhas reais exportadas em CSV.
