# Fluxo de trabalho: do código à produção

**A `main` é produção.** Todo merge nela é publicado no Cloud Run sem passo manual. Por isso, só entra na `main` código que passou pelo CI num pull request.

```
branch ──► PR ──► CI (testes, build, imagem, Terraform) ──► merge (squash) na main
                                                                │
                     Deploy automático (.github/workflows/deploy.yml)
                     CI de novo ► imagens ► migrations ► revisão sem tráfego
                     ► smoke test ► 100% do tráfego ► e-mail se algo falhar
```

## 1. Dia a dia

1. **Crie um branch** a partir da `main` atualizada:
   - `feat/<assunto>` para funcionalidade (ex.: `feat/contas-a-receber`)
   - `fix/<assunto>` para correção (ex.: `fix/rateio-arredondamento`)
   - `chore/<assunto>` para manutenção, dependências ou infra
2. **Faça PRs pequenos**, de preferência com uma ideia por PR. PR pequeno é revisado melhor e, se der problema, volta fácil.
3. **Abra o PR** e preencha o template. O CI roda sozinho:
   - auditoria de dependências;
   - migrations num banco vazio;
   - schema × migrations;
   - lint, tipos e testes;
   - build de produção e e2e;
   - imagem Docker;
   - Terraform.
4. **Só faça o merge com o CI verde**, sempre com **"Squash and merge"**. Cada PR vira um commit na `main`, e o histórico fica legível e fácil de reverter.
5. **Acompanhe o deploy** em *Actions → Deploy*. O resumo da execução mostra o commit e a revisão publicada. Em ~7 min está no ar.
6. **Confira em produção** a tela que você mudou.

Mudanças **só de documentação** (`docs/`, arquivos `.md`) não geram deploy.

### Mensagens de commit e PR

- **Escreva em português, no imperativo, dizendo o que muda para quem usa o app.** Exemplos: "Lança recibo sem NF com número automático", "Corrige rateio quando a soma passa de 100%".
- **O título do PR vira a mensagem do commit na `main`**, então capriche nele.

## 2. Banco de dados (migrations)

As migrations rodam **antes** da nova versão entrar no ar, enquanto a versão anterior ainda atende os usuários. Por isso, **toda migration precisa funcionar com o código antigo e com o novo**.

| Mudança | Como fazer |
|---|---|
| Criar tabela ou coluna opcional | Pode ir direto, num PR só. |
| Coluna obrigatória nova | Crie com valor padrão (`@default`) ou opcional. Torne obrigatória num PR seguinte. |
| Renomear coluna | 3 PRs: (1) cria a nova e o código grava nas duas; (2) o código passa a ler só a nova; (3) remove a antiga. |
| Apagar coluna ou tabela | 2 PRs: (1) o código para de usar; (2) a migration remove. |
| Migração de dados pesada | Script separado em `prisma/`, rodado com acompanhamento, não dentro da migration. |

**Nunca edite uma migration que já foi para a `main`.** Crie uma nova. O CI confere se o `schema.prisma` bate com as migrations.

## 3. Quando algo dá errado

### O deploy falhou

- **Falhou antes de "Promove para 100% do tráfego":** os usuários continuam na versão anterior. Corrija num novo PR. Se o erro foi na migration, veja o log do passo *Migrations*.
- **Falhou depois da migration:** o banco já está na versão nova. Isso é seguro se a regra da seção 2 foi seguida, porque a versão antiga continua funcionando com ele.
- **Avisos:** o GitHub manda e-mail para quem fez o merge. O Google manda e-mail se o app começar a dar erro 5xx (e se ficar fora do ar, com `verificacao_disponibilidade = true` no Terraform).

### A versão nova está com problema: rollback

1. Abra *Actions → Rollback → Run workflow* **sem** preencher nada. O resumo lista as revisões, com nome no formato `gestao-obras-r<nº do deploy>-<tentativa>-<commit>`, e mostra qual está no ar.
2. Rode de novo informando a revisão anterior boa. Em segundos o tráfego volta para ela, sem rebuild.
3. Corrija com calma num PR. O próximo deploy da `main` volta a mandar o tráfego para a revisão mais nova.

⚠️ **O rollback não desfaz migrations.** Se o problema estiver no banco, a correção é uma nova migration, ou uma restauração de backup (ver [`deploy-gcp.md`](deploy-gcp.md#backups-e-restauração)).

### Correção urgente (hotfix)

É o mesmo fluxo, só com prioridade: um branch `fix/...`, um PR pequeno, CI verde e merge. Não existe atalho de push direto na `main`. Se a situação for grave, faça **rollback primeiro** e corrija depois.

## 4. Segredos e configuração

- **Nunca** coloque senha, chave ou token no código, em `.env` commitado, em print ou em comentário de PR.
- **Segredos do app** ficam no Secret Manager. Para adicionar ou trocar, use `gcloud secrets versions add <segredo> --data-file=-` no Cloud Shell e faça um novo deploy (*Actions → Deploy → Run workflow*) para o app ler a versão nova.
- **Variáveis do GitHub** (`GCP_*`) não são segredos e ficam em *Settings → Secrets and variables → Actions → Variables*.
- **O GitHub não tem chave do Google.** Ele se autentica por OIDC, e só a branch `main` deste repositório consegue credenciais.

## 5. Infraestrutura (Terraform)

1. Mude os arquivos em `infra/terraform/` num PR. O CI valida (`fmt` e `validate`).
2. Depois do merge, aplique no Cloud Shell:
   ```bash
   cd ~/gestao-obras && git pull && ./infra/bootstrap.sh gestao-obras-prod
   ```
   Leia o plano antes de digitar `yes`. **Se aparecer `destroy` em algo que você não pretendia, responda `no`.**
3. Se o código novo depende da infra nova (uma variável de ambiente, por exemplo), aplique a infra **antes** do merge do código.

## 6. Dependências (Dependabot)

- **Toda segunda** chega um PR agrupado com as atualizações *minor/patch* do npm. Com o CI verde, o merge é seguro.
- **Versões *major*** (ex.: TypeScript 7, Vitest 5, Prisma 8) não são abertas automaticamente, porque costumam exigir ajuste de código. Faça num PR próprio, planejado.
- **GitHub Actions e a imagem base do Docker** são atualizadas mensalmente. As actions são fixadas por SHA, e o Dependabot atualiza o SHA.
- O CI barra qualquer dependência de produção com vulnerabilidade **crítica**.

## 7. Configuração do GitHub (uma vez só)

### Proteção da `main`

Ela impede push direto e merge sem CI verde.

1. *Settings → Rules → Rulesets → New ruleset → **Import a ruleset***.
2. Selecione o arquivo [`.github/rulesets/protecao-main.json`](../.github/rulesets/protecao-main.json) do repositório e salve.

A regra:
- exige PR para alterar a `main`;
- exige os 3 checks do CI verdes, com o branch atualizado em relação à `main`;
- só permite *squash merge*;
- exige conversas de revisão resolvidas;
- bloqueia force-push e exclusão da `main`.

Ela **não exige aprovação de outra pessoa**, porque hoje há um só desenvolvedor. Quando entrar mais alguém, mude `required_approving_review_count` para `1`.

> Em repositório privado, rulesets exigem o plano GitHub Pro ou Team. No plano gratuito, a importação não fica disponível. Nesse caso, siga este fluxo por disciplina: nunca faça push direto na `main`.

### Ambiente `production`

*Settings → Environments → production → Deployment branches and tags → **Selected branches** → adicione `main`.* Isso reforça no GitHub o que o Google já garante: só a `main` publica.

### Opcional

*Settings → General → Pull Requests*: deixe marcado apenas **Allow squash merging** e ative **Automatically delete head branches**.

## Checklist rápido

- [ ] Branch a partir da `main` atualizada
- [ ] PR pequeno, template preenchido
- [ ] Migration compatível com a versão no ar
- [ ] CI verde → squash merge
- [ ] Deploy verde em *Actions* → conferir em produção
- [ ] Problema? *Actions → Rollback*, depois correção num PR
