# Política de segurança

## Como reportar uma vulnerabilidade

Não abra issue pública. Use o reporte privado do GitHub: aba **Security → Report a vulnerability** neste repositório. Inclua:

- o que encontrou e o impacto (que dado ou ação fica exposto);
- passos para reproduzir (URL, papel do usuário usado, requisição);
- se possível, uma sugestão de correção.

A resposta sai em até 3 dias úteis, com prazo de correção combinado conforme a gravidade. Não acesse, altere ou apague dados de outras pessoas além do mínimo para demonstrar o problema.

## Escopo

O código deste repositório (app Next.js, infraestrutura em `infra/` e esteira em `.github/`). Camadas de proteção, riscos conhecidos e roteiro de incidente: [`docs/seguranca.md`](docs/seguranca.md).

## Dados

O repositório não contém dados de clientes. Fixtures, seeds e exemplos usam dados fictícios (CNPJs com dígito verificador calculado, empresas inventadas). Credenciais de produção ficam no Secret Manager do GCP e nas variáveis do GitHub Actions, nunca no código.
