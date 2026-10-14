## O que muda

<!-- Uma ou duas frases: o problema e a solução, do ponto de vista de quem usa o app. -->

## Tipo

- [ ] Funcionalidade nova
- [ ] Correção
- [ ] Infraestrutura / CI
- [ ] Documentação ou manutenção

## Checklist antes do merge

- [ ] CI verde (o merge na `main` publica em produção automaticamente)
- [ ] Testes cobrindo a regra de negócio alterada (`src/services/`)
- [ ] Migration de banco compatível com a versão que está no ar (sem renomear/apagar coluna em uso — ver `docs/fluxo-de-trabalho.md`)
- [ ] Nenhum segredo, senha ou dado de cliente no código ou nos prints
- [ ] Variáveis/infra novas descritas abaixo (e aplicadas com o `bootstrap.sh` antes do merge, se necessário)

## Como testar

<!-- Passos para conferir na tela, perfil de usuário usado (ADMIN/ESCRITORIO/CAMPO). -->
