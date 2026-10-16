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

Leitura automática de foto/PDF de nota: nativa, sem serviço de IA externo — camada de texto do PDF, código de barras/QR e OCR local (Tesseract). `OCR_MOTOR=vision` usa o Google Cloud Vision (mais preciso em foto); `OCR_MOTOR=desligado` deixa foto/PDF só anexados. Na conferência, o botão **Analisar com IA** (Gemini, opcional: `GEMINI_PROJETO` ou `GEMINI_API_KEY`) relê o documento quando o índice de acerto é baixo. Após a leitura, um pop-up de conferência mostra todos os dados ao lado do documento e só grava após a confirmação do usuário; `CNPJS_EMPRESA` (opcional) confere o destinatário da nota. Detalhes em [`docs/leitura-nota-fiscal.md`](docs/leitura-nota-fiscal.md).

Login inicial: `admin@obras.local` / `admin123` (troque em **Minha conta**).

Novos usuários: em **Usuários → Convidar por link** o admin define papel, obras e validade e envia o link (WhatsApp, e-mail ou copiar); a pessoa cria a própria conta em `/convite/<token>`. O link é de uso único e o banco guarda só o hash do token. O endereço do link sai do próprio request; defina `APP_URL` (ex.: `https://obras.suaempresa.com.br`) se o app ficar atrás de um domínio diferente.

Para testar no celular: acesse `http://<IP-da-máquina>:3000` na mesma rede Wi-Fi e use "Adicionar à tela inicial".

## Produção (Google Cloud)

Cloud Run + Cloud SQL (PostgreSQL) + Cloud Storage em São Paulo, infraestrutura em Terraform (`infra/`) e deploy automático pelo GitHub Actions a cada merge na `main` (CI → migrations → revisão nova testada antes de receber tráfego). Configuração inicial, operação e segurança: [`docs/deploy-gcp.md`](docs/deploy-gcp.md). Como trabalhar no dia a dia (branch → PR → merge → deploy, migrations, rollback): [`docs/fluxo-de-trabalho.md`](docs/fluxo-de-trabalho.md).

Em produção os arquivos vão para o bucket definido em `STORAGE_BUCKET`; sem essa variável, ficam em `./uploads` (desenvolvimento).

## Testes

```bash
npm test                # Vitest — services (parcelas, rateio, fluxo, importação, senha, bloqueio de login)
npx playwright test     # e2e — fluxo crítico (NF → pagar → custo na obra), convite e segurança; falha se houver violação de CSP
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 + shadcn/ui · PostgreSQL + Prisma 6 · Auth.js v5 · Recharts. Dinheiro em centavos (Int); percentuais em basis points. Regras de negócio em `src/services/` (puras, testadas).

## Estrutura

- `src/app/(app)/` — módulos: obras (página em abas: `obras/[id]/abas/`), fornecedores, materiais (catálogo + vínculo automático com os itens das notas), notas (lançamentos com envio único de foto/PDF/XML em `nova/` + `importar-xml`), contas, diario, cronograma (Gantt, curva S, Avanço), orcamento (+ `abc`), usuarios, dashboard (+ `alertas`, `widgets/`), importar (migração CSV — fora do menu)
- `src/app/convite/[token]` — cadastro público pelo link de convite
- `src/app/(app)/conta` — Minha conta: troca de senha, sair de todos os aparelhos, acessos recentes
- `src/services/` — acesso (permissão por obra), senha (política), protecao-login (força bruta), arquivos (tipo pelo conteúdo, URLs aceitas), convite, atividade (catálogo do log, atuação por obra), parcelas, rateio, financeiro, obra, custos, obras (seleção de obras ativas), importacao, dependencia, cronograma, rdo, analises (curva ABC, alertas), fornecedores, correspondencia-fornecedor, nfe-xml, leitura-documento (conferência da nota lida), leitor-nativo (foto/PDF → dados: texto do PDF, código de barras/QR, OCR) e leitor-gemini (Analisar com IA)
- `src/lib/` — prisma, auth (`usuarioAtual`, `exigirPapel`, `exigirAcessoObra`, bloqueio de login) + auth.config (sessão, usada também pelo `src/proxy.ts`), acao (`acaoDeEscrita` — seam das server actions e do log de auditoria), atividade (`anotarAtividade`), log-seguranca (eventos em JSON), csp, token (link de convite), format (moeda/data/percentual BR), storage, imagem (reduz a foto antes do upload)
- `src/proxy.ts` — Content-Security-Policy com nonce e renovação do cookie de sessão
- `prisma/` — schema, seed, `teste-fluxo.ts` (dados de demonstração)

## Papéis

| Papel | Acesso |
|---|---|
| ADMIN | tudo + usuários, convites e log de atividade |
| ESCRITORIO | NFs, financeiro, orçamento, importação — todas as obras |
| CAMPO | RDO (edita/exclui o próprio por 7 dias), avanço no cronograma, obras — sem valores financeiros (bloqueado no servidor). Pode ser limitado a obras específicas: as demais somem das listas e dão 404 pela URL |

Papel, desativação e obras liberadas valem na hora: a sessão é conferida no banco a cada requisição (`usuarioAtual` em `lib/auth.ts`), não só no login. Trocar a senha ou **Encerrar sessões** derruba os logins abertos em todos os aparelhos.

## Segurança

Camadas (contas, autorização, CSP, arquivos, dados, nuvem, CI/CD, alertas), riscos aceitos e roteiro de incidente: [`docs/seguranca.md`](docs/seguranca.md). Para reportar uma falha: [`SECURITY.md`](SECURITY.md). Em resumo: senha mínima de 10 caracteres, bloqueio após 5 tentativas erradas, sessão de 8 h ociosa / 7 dias no máximo, CSP com nonce (`src/proxy.ts`), arquivos conferidos pelo conteúdo e por obra, eventos de segurança em JSON no log com alertas no Terraform.

**Gestão de acessos ligada aos dados:** cada usuário tem uma página (`/usuarios/<id>`) com o que produziu — lançamentos e valor, RDOs, avanços, atuação por obra, produção semanal — e o histórico de ações. Toda action com `atividade` em `acaoDeEscrita` grava uma linha no log de auditoria (`Atividade`), com o detalhe anotado via `anotarAtividade` (`lib/atividade.ts`; catálogo de tipos em `services/atividade.ts`). A obra ganhou a aba **Equipe** (quem acessa e o que cada um registrou nela).

## Pendências conscientes

- Service worker (cache offline) não instalado — o PWA é instalável via manifest.
- Rateio é por nota (aplicado a todos os itens) — o modelo de dados garante isso (`RateioNota` pertence à `NotaFiscal`, não ao item). Para destinar um item a outra obra, lance em uma nota separada.
- Editar um lançamento preserva as parcelas pagas cujo valor e vencimento não mudaram; alterar ou remover uma parcela paga a reabre/remove, com confirmação.
- Lançamentos sem NF (recibo, folha, guia, outro) recebem número automático por fornecedor quando ficam em branco: `REC-0001`, `FOL-0001`, `GUIA-0001`, `DOC-0001`.
- Datas em colunas `@db.Date` (RDO, datas previstas de etapa) e datas gravadas à meia-noite UTC podem aparecer um dia antes num servidor fora de UTC — rodar o servidor em UTC até a padronização (ver plano, Onda 2).
- Fotos removidas de um RDO ficam órfãs no storage (`./uploads` ou o bucket) até o driver ganhar `remover` (Onda 2).
- O log de auditoria começa a contar a partir da migração `gestao_acessos`; a página do usuário usa os próprios registros (autor do RDO, de quem lançou a nota, do avanço) para mostrar o histórico anterior.
- Importador espera o formato documentado na tela Importar — valide com as planilhas reais exportadas em CSV.
