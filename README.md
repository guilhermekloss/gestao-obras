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

Novos usuários: em **Usuários → Convidar por link** o admin define papel, obras e validade e envia o link (WhatsApp, e-mail ou copiar); a pessoa cria a própria conta em `/convite/<token>`. O link é de uso único e o banco guarda só o hash do token. O endereço do link sai do próprio request; defina `APP_URL` (ex.: `https://obras.suaempresa.com.br`) se o app ficar atrás de um domínio diferente.

Para testar no celular: acesse `http://<IP-da-máquina>:3000` na mesma rede Wi-Fi e use "Adicionar à tela inicial".

## Produção (Google Cloud)

Cloud Run + Cloud SQL (PostgreSQL) + Cloud Storage em São Paulo, infraestrutura em Terraform (`infra/`) e deploy automático pelo GitHub Actions a cada merge na `main` (CI → migrations → revisão nova testada antes de receber tráfego). Configuração inicial, operação e segurança: [`docs/deploy-gcp.md`](docs/deploy-gcp.md).

Em produção os arquivos vão para o bucket definido em `STORAGE_BUCKET`; sem essa variável, ficam em `./uploads` (desenvolvimento).

## Testes

```bash
npm test                # Vitest — services (parcelas, rateio, fluxo, importação)
npx playwright test     # e2e — fluxo crítico: NF → pagar → custo na obra
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 + shadcn/ui · PostgreSQL + Prisma 6 · Auth.js v5 · Recharts. Dinheiro em centavos (Int); percentuais em basis points. Regras de negócio em `src/services/` (puras, testadas).

## Estrutura

- `src/app/(app)/` — módulos: obras (página em abas: `obras/[id]/abas/`), fornecedores, notas (lançamentos com envio único de foto/PDF/XML em `nova/` + `importar-xml`), contas, diario, cronograma (Gantt, curva S, Avanço), orcamento (+ `abc`), usuarios, dashboard (+ `alertas`, `widgets/`), importar (migração CSV — fora do menu), medicoes (redireciona para cronograma)
- `src/app/convite/[token]` — cadastro público pelo link de convite
- `src/services/` — acesso (permissão por obra), convite, atividade (catálogo do log, atuação por obra), parcelas, rateio, financeiro, obra, custos, obras (seleção de obras ativas), importacao, dependencia, cronograma, rdo, analises (curva ABC, alertas), nfe-xml, leitura-documento (conferência da nota lida) + leitor-ia (Claude: foto/PDF → dados)
- `src/lib/` — prisma, auth (`usuarioAtual`, `exigirPapel`, `exigirAcessoObra`), acao (`acaoDeEscrita` — seam das server actions e do log de auditoria), atividade (`anotarAtividade`), token (link de convite), format (moeda/data/percentual BR), storage, imagem (reduz a foto antes do upload)
- `prisma/` — schema, seed, `teste-fluxo.ts` (dados de demonstração)

## Papéis

| Papel | Acesso |
|---|---|
| ADMIN | tudo + usuários, convites e log de atividade |
| ESCRITORIO | NFs, financeiro, orçamento, importação — todas as obras |
| CAMPO | RDO (edita/exclui o próprio por 7 dias), avanço no cronograma, obras — sem valores financeiros (bloqueado no servidor). Pode ser limitado a obras específicas: as demais somem das listas e dão 404 pela URL |

Papel, desativação e obras liberadas valem na hora: a sessão é conferida no banco a cada requisição (`usuarioAtual` em `lib/auth.ts`), não só no login.

**Gestão de acessos ligada aos dados:** cada usuário tem uma página (`/usuarios/<id>`) com o que produziu — lançamentos e valor, RDOs, avanços, atuação por obra, produção semanal — e o histórico de ações. Toda action com `atividade` em `acaoDeEscrita` grava uma linha no log de auditoria (`Atividade`), com o detalhe anotado via `anotarAtividade` (`lib/atividade.ts`; catálogo de tipos em `services/atividade.ts`). A obra ganhou a aba **Equipe** (quem acessa e o que cada um registrou nela).

## Pendências conscientes

- Service worker (cache offline) não instalado — o PWA é instalável via manifest; Serwist fica para quando o deploy for definido.
- Rateio é por nota (aplicado a todos os itens) — o modelo de dados garante isso (`RateioNota` pertence à `NotaFiscal`, não ao item). Para destinar um item a outra obra, lance em uma nota separada.
- Editar um lançamento preserva as parcelas pagas cujo valor e vencimento não mudaram; alterar ou remover uma parcela paga a reabre/remove, com confirmação.
- Lançamentos sem NF (recibo, folha, guia, outro) recebem número automático por fornecedor quando ficam em branco: `REC-0001`, `FOL-0001`, `GUIA-0001`, `DOC-0001`.
- Datas em colunas `@db.Date` (RDO, datas previstas de etapa) e datas gravadas à meia-noite UTC podem aparecer um dia antes num servidor fora de UTC — rodar o servidor em UTC até a padronização (ver plano, Onda 2).
- Fotos removidas de um RDO ficam órfãs no storage (`./uploads` ou o bucket) até o driver ganhar `remover` (Onda 2).
- O log de auditoria começa a contar a partir da migração `gestao_acessos`; a página do usuário usa os próprios registros (autor do RDO, de quem lançou a nota, do avanço) para mostrar o histórico anterior.
- Arquivos em `/api/fotos` exigem login, mas não conferem a obra do arquivo (nomes aleatórios, não listáveis).
- Importador espera o formato documentado na tela Importar — valide com as planilhas reais exportadas em CSV.
