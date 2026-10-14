variable "project_id" {
  description = "ID do projeto GCP (dedicado a este app)."
  type        = string
}

variable "region" {
  description = "Região de todos os recursos. southamerica-east1 = São Paulo (latência baixa e dados no Brasil)."
  type        = string
  default     = "southamerica-east1"
}

variable "app_name" {
  description = "Prefixo dos recursos."
  type        = string
  default     = "gestao-obras"
}

# --- GitHub (CI/CD sem chave de service account: Workload Identity Federation) ---

variable "github_repository" {
  description = "Repositório owner/nome autorizado a fazer deploy."
  type        = string
  default     = "guilhermekloss/gestao-obras"
}

variable "github_repository_id" {
  description = "ID numérico do repositório (não muda se o repo for renomeado/recriado por outra pessoa)."
  type        = string
  default     = "1293500654"
}

variable "github_branch_deploy" {
  description = "Única branch cujo workflow pode obter credenciais do GCP."
  type        = string
  default     = "main"
}

# --- Banco ---

variable "db_tier" {
  description = "Máquina do Cloud SQL. db-f1-micro (~US$ 10/mês) atende o início; db-g1-small ou db-custom-1-3840 quando crescer."
  type        = string
  default     = "db-f1-micro"
}

variable "db_alta_disponibilidade" {
  description = "REGIONAL (failover automático entre zonas) dobra o custo do banco."
  type        = bool
  default     = false
}

# --- Cloud Run ---

variable "min_instancias" {
  description = "0 = escala a zero (mais barato, primeira requisição após ociosidade leva alguns segundos). 1 = sempre quente."
  type        = number
  default     = 0
}

variable "max_instancias" {
  description = "Teto de instâncias (protege custo e o limite de conexões do banco)."
  type        = number
  default     = 3
}

variable "leitura_ia_habilitada" {
  description = "Monta o segredo ANTHROPIC_API_KEY no app. Antes de ativar, adicione uma versão ao segredo (ver docs/deploy-gcp.md)."
  type        = bool
  default     = false
}

variable "cnpjs_empresa" {
  description = "Opcional: CNPJs da empresa (separados por vírgula) para conferir o destinatário da nota lida."
  type        = string
  default     = ""
}

# --- Custos e alertas ---

variable "billing_account_id" {
  description = "Conta de faturamento (XXXXXX-XXXXXX-XXXXXX) para o alerta de orçamento. Vazio = sem orçamento."
  type        = string
  default     = ""
}

variable "orcamento_mensal" {
  description = "Valor do orçamento mensal, na moeda da conta de faturamento."
  type        = number
  default     = 300
}

variable "moeda_orcamento" {
  description = "Moeda da conta de faturamento (precisa ser a mesma da conta)."
  type        = string
  default     = "BRL"
}

variable "email_alertas" {
  description = "E-mail que recebe alertas de indisponibilidade. Vazio = sem alerta."
  type        = string
  default     = ""
}
