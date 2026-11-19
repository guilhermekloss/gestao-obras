# Gestão de Obras

Plataforma web (responsiva, instalável como PWA) para construtoras de pequeno e médio porte controlarem custo, cronograma e diário das obras num lugar só, no lugar das planilhas de quantitativo e financeiro.

## Contexto e meu papel

Construí este sistema para uma empresa de construção que controlava custo e obra em planilhas. Atuei como **product builder e forward deployed engineer**: fiz tudo sozinho, da conversa com quem usa o sistema ao deploy em produção.

- **Produto:** levantei como o escritório e o campo trabalhavam e defini o que entra e o que fica de fora.
- **Desenvolvimento:** escrevi o app inteiro, do banco e das regras de negócio à interface mobile.
- **Cloud:** configurei toda a infra no Google Cloud com Terraform e a esteira de CI/CD, com deploy sem passo manual.
- **Segurança:** defini e apliquei as diretrizes, de autorização e sessão a segredos e permissões na nuvem.

**Boas práticas aplicadas**

- **Código:** TypeScript estrito, regras de negócio puras em `src/services/`, dinheiro em centavos, escrita de dados por um ponto único com log de auditoria.
- **Testes:** unitários, casos-limite, teste de mutação e e2e rodando contra o build de produção.
- **CI/CD:** lint, tipos, testes, build, migrations conferidas contra o schema, imagem Docker sem root e smoke test antes de receber tráfego, com rollback em workflow próprio.
- **Infra como código:** Terraform validado no CI, deploy por OIDC (sem chave de serviço), segredos no Secret Manager, banco sem IP público.
- **Cadeia de suprimentos:** GitHub Actions fixadas por SHA, Dependabot, `npm audit` e verificação de assinaturas.
- **Processo:** `main` protegida, PR com checklist, histórico linear e documentação em `docs/`.

**Resultados:** [preencher só com dado real, ex.: tempo de lançamento de nota antes e depois, nº de obras e usuários ativos]

---

## Produto

### O problema

Em construtora pequena e média, o custo da obra costuma viver em planilhas: uma de notas fiscais, outra de quantitativo, outra de contas a pagar. Isso gera três problemas recorrentes:

1. **Custo por obra impreciso.** Uma nota que atende duas obras é lançada inteira em uma, ou dividida à mão. Mão de obra, diárias e guias ficam de fora porque "não têm nota".
2. **Digitação manual.** Cada nota é redigitada item a item, com erro de valor, CNPJ e vencimento.
3. **Escritório e campo desconectados.** O engenheiro registra o dia da obra no papel ou no WhatsApp; o avanço físico não conversa com o financeiro, e ninguém vê desvio de prazo ou custo antes de ele acontecer.

### Para quem

| Perfil | O que precisa | Papel no app |
|---|---|---|
| Dono / gestor | Saber quanto cada obra custou, quanto falta pagar e onde está o desvio | `ADMIN` |
| Escritório (financeiro, compras) | Lançar notas rápido, ratear entre obras, controlar vencimentos | `ESCRITORIO` |
| Campo (engenheiro, mestre) | Registrar o diário e o avanço pelo celular, sem ver valores | `CAMPO` |

### O que o produto faz

**Custo e financeiro**
- Lançamento de NF, recibo, folha e guia com **rateio entre obras** e parcelas a pagar. Lançamento sem NF ganha número automático, para que todo custo entre na obra.
- **Leitura automática da nota** por foto, PDF ou XML da NF-e e da NFS-e: texto do PDF, código de barras/QR e OCR local. Uma tela de conferência mostra os dados ao lado do documento e só grava depois da confirmação. IA (Gemini) é opcional, para releitura quando a confiança é baixa.
- **Captura automática de NF-e na Sefaz** com o certificado A1 da empresa: as notas emitidas contra o CNPJ aparecem sem ninguém digitar.
- Contas a pagar por urgência e fluxo mensal.
- Catálogo de materiais que se liga sozinho aos itens das notas pela descrição.

**Planejamento e campo**
- Cronograma com Gantt, curva S, linha de base, IDP e status de atenção por etapa.
- **Diário de obra (RDO)** mobile com fotos, rascunho offline no aparelho e versão para impressão.
- Avanço físico por etapa, lançado pelo campo.

**Análise**
- Orçamento × realizado por obra e etapa, curva ABC de insumos, desembolso mensal contra a linha de base e alerta de tendência de estouro.
- **Score de dependência de fornecedor**: mostra quanto do gasto está concentrado em poucos fornecedores (nenhum dos concorrentes pesquisados oferece).
- Dashboard com filtro por obra e central de alertas.

**Reforma tributária (IBS/CBS)**
- Lê o IBS e a CBS destacados em cada item da NF-e e da NFS-e, com a classificação tributária oficial da Receita.
- Calcula o crédito a recuperar (só no regime regular, a partir de 2027) e mostra o custo líquido no orçamento, na obra, na curva ABC e no material.
- Compara o custo efetivo por fornecedor: o preço da nota menos o crédito que a empresa aproveita.
- Confere o imposto que o fornecedor destacou e avisa o que não bate. Só avisa: não bloqueia o lançamento.
- Detalhes, limitações e como atualizar a tabela da Receita: [`docs/reforma-tributaria.md`](docs/reforma-tributaria.md).

**Navegação e preenchimento**
- Busca global (Ctrl+K) por tela, ação, obra, fornecedor, lançamento e material.
- Lançamento repete pagamento e rateio do último lançamento do fornecedor e gera as parcelas sozinho; o RDO repete a equipe do dia anterior com um toque.

**Acesso e auditoria**
- Convite por link de uso único, com papel, obras liberadas e validade.
- Usuário de campo pode ser limitado a obras específicas; valores financeiros são bloqueados no servidor, não só escondidos na tela.
- Log de auditoria de toda ação de escrita e página de atuação por usuário (o que lançou, em quais obras, produção semanal).
- Assistente de navegação: tour guiado no primeiro acesso, central de ajuda por fluxo e perguntas em linguagem natural.

### Decisões de produto

- **Escopo deliberadamente menor que um ERP.** O benchmark com Sienge, Obra Prima, Vobi, Mais Controle e outros ([`docs/plano-evolucao.md`](docs/plano-evolucao.md)) definiu o que fica de fora: BIM, RFIs, licitação, CRM, base SINAPI completa. O foco é o que a construtora pequena usa todo dia.
- **Leitura de nota sem depender de IA externa.** O leitor nativo roda local e sem custo por documento. A IA entra só como reforço opcional. Isso reduz custo variável e evita mandar documento fiscal para terceiros por padrão.
- **Conferência humana antes de gravar.** Leitura automática erra; o usuário vê o documento e os campos lado a lado e confirma. A tela mostra o índice de acerto para indicar onde olhar.
- **Rateio por nota, não por item.** Simplifica o lançamento, que é o gargalo do escritório. Item para outra obra vai em nota separada.
- **Campo sem valores.** O papel `CAMPO` registra diário e avanço, mas não vê custo. A regra é aplicada no servidor e a sessão é conferida no banco a cada requisição, então mudar papel ou desativar alguém vale na hora.

### Roadmap

Próximas ondas (detalhe em [`docs/plano-evolucao.md`](docs/plano-evolucao.md)):

- Contratos de empreiteiro e medição de serviço com retenções (INSS, ISS, caução), que hoje é o maior custo fora do sistema.
- Compras: solicitação → cotação → pedido → NF vinculada.
- Contas a receber e fluxo de caixa realizado + projetado.
- Documentos da obra, portal do cliente, conciliação OFX, notificações por WhatsApp.

---

## Engenharia

### Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind 4 + shadcn/ui · PostgreSQL + Prisma 6 · Auth.js v5 · Recharts · Tesseract (OCR local) · Google Cloud (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager) · Terraform · GitHub Actions.

### Arquitetura

- **Regras de negócio puras em `src/services/`**, sem dependência de framework e cobertas por testes unitários: rateio, parcelas, custos, cronograma, curva ABC, alertas, permissão por obra, política de senha, proteção contra força bruta, leitor de documentos, cliente Sefaz.
- **Dinheiro em centavos (`Int`) e percentuais em basis points**, para não ter erro de ponto flutuante em soma de parcelas e rateio.
- **Seam único para escrita:** toda Server Action passa por `acaoDeEscrita` (`src/lib/acao.ts`), que valida sessão, papel e acesso à obra e grava o log de auditoria.
- **Leitor de documentos em duas etapas:** extração (texto do PDF, código de barras, OCR ou Cloud Vision) → interpretação por tipo de documento (DANFE, NFC-e, NFS-e, boleto, guia, recibo) → normalização e checagem de somas.

```
src/
  app/(app)/      módulos: obras, notas, contas, cronograma, diario, orcamento,
                  fornecedores, materiais, dashboard, usuarios, empresa, sefaz
  services/       regras de negócio (puras e testadas), leitor-nativo/, sefaz/, assistente/
  lib/            auth, acao (seam de escrita), csp, storage, cofre (cifra do certificado A1)
  proxy.ts        Content-Security-Policy com nonce e renovação de sessão
prisma/           schema, migrations, seed e dados de demonstração
infra/terraform/  toda a infraestrutura do GCP
e2e/              Playwright: fluxo crítico, convite, segurança, acessibilidade
```

### Qualidade

- Testes unitários (Vitest) nas regras de negócio, com suítes de casos-limite separadas (`*-limites.test.ts`).
- **Teste de mutação** (Stryker) para medir se os testes realmente pegam erro, não só cobrem linha.
- E2E (Playwright) do fluxo crítico (nota → pagar parcela → custo na obra), convite, permissões, captura Sefaz e acessibilidade (rótulos, foco e área de toque em todas as telas do menu). O e2e falha se houver violação de CSP.
- Corpus sintético de documentos fiscais (`scripts/leitor-nativo/`) para medir a precisão do leitor a cada mudança.

### Segurança

- Senha mínima de 10 caracteres, bloqueio após 5 tentativas, sessão de 8 h ociosa / 7 dias no máximo, revogação de todas as sessões.
- CSP com nonce, arquivos validados pelo conteúdo (não pela extensão) e servidos com checagem de acesso por obra.
- Certificado A1 cifrado no banco com chave do Secret Manager.
- Banco sem IP público (só Auth Proxy via IAM), deploy via OIDC sem chave de serviço, actions fixadas por SHA, `npm audit` e verificação de assinaturas no CI.
- Detalhes, riscos aceitos e roteiro de incidente: [`docs/seguranca.md`](docs/seguranca.md). Reporte de falhas: [`SECURITY.md`](SECURITY.md).

### Deploy

Cloud Run + Cloud SQL + Cloud Storage em São Paulo, provisionados por Terraform. Cada merge na `main` passa por CI, gera imagem, roda migrations, sobe uma revisão sem tráfego, faz smoke test e só então recebe 100% do tráfego. Guia: [`docs/deploy-gcp.md`](docs/deploy-gcp.md) e [`docs/fluxo-de-trabalho.md`](docs/fluxo-de-trabalho.md).

---

## Rodando local

Pré-requisitos: Node 22 e Docker.

```bash
docker compose up -d          # PostgreSQL local
npm install
cp .env.example .env          # preencha o AUTH_SECRET
npx prisma migrate dev        # cria as tabelas
npm run db:seed               # usuário admin + 6 obras com etapas padrão
npx tsx prisma/teste-fluxo.ts # opcional: dados de demonstração
npm run dev                   # http://localhost:3000
```

Login local: `admin@obras.local` / `admin123`. Esse usuário só existe no seed de desenvolvimento; em produção o seed exige `SEED_ADMIN_SENHA` com 12+ caracteres.

Variáveis opcionais: `OCR_MOTOR` (`vision` usa o Google Cloud Vision; `desligado` só anexa o arquivo), `GEMINI_PROJETO` ou `GEMINI_API_KEY` (habilita o botão **Analisar com IA**), `CNPJS_EMPRESA` (confere o destinatário da nota), `STORAGE_BUCKET` (sem ele, arquivos vão para `./uploads`), `APP_URL` (domínio dos links de convite). Detalhes em [`docs/leitura-nota-fiscal.md`](docs/leitura-nota-fiscal.md) e [`docs/captura-sefaz.md`](docs/captura-sefaz.md).

### Testes

```bash
npm test                # unitários (Vitest)
npm run test:e2e        # e2e (Playwright)
npm run test:mutation   # teste de mutação (Stryker)
```

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`plano-evolucao.md`](docs/plano-evolucao.md) | Benchmark de mercado, mapa de funcionalidades e roadmap |
| [`leitura-nota-fiscal.md`](docs/leitura-nota-fiscal.md) | Como funciona a leitura de foto, PDF e XML |
| [`captura-sefaz.md`](docs/captura-sefaz.md) | Captura automática de NF-e com certificado A1 |
| [`reforma-tributaria.md`](docs/reforma-tributaria.md) | IBS/CBS: dados, regra de crédito, conferência e atualização da tabela da Receita |
| [`assistente-e-fluxos.md`](docs/assistente-e-fluxos.md) | Assistente de navegação e auditoria dos fluxos |
| [`seguranca.md`](docs/seguranca.md) | Camadas de segurança, riscos aceitos, incidente |
| [`deploy-gcp.md`](docs/deploy-gcp.md) | Infraestrutura e primeiro deploy |
| [`fluxo-de-trabalho.md`](docs/fluxo-de-trabalho.md) | Branch → PR → deploy, migrations e rollback |
| [`identidade-visual.md`](docs/identidade-visual.md) | Tipografia, cores e componentes |
| [`auditoria-indices.md`](docs/auditoria-indices.md) / [`auditoria-timeouts.md`](docs/auditoria-timeouts.md) | Revisões de performance do banco e de timeouts |

## Limitações conhecidas

- Sem service worker: o PWA é instalável, mas não funciona offline (o rascunho do RDO fica salvo no aparelho).
- Rateio é por nota; item destinado a outra obra vai em nota separada.
- Datas `@db.Date` assumem servidor em UTC até a padronização.
- Fotos removidas de um RDO ficam no storage até existir uma rotina de limpeza.
