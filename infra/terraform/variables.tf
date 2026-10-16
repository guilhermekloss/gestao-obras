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

variable "motor_ocr" {
  description = "OCR da leitura de foto/PDF escaneado: local (Tesseract no próprio app, sem serviço externo), vision (Google Cloud Vision: mais preciso em foto, 1.000 grátis/mês) ou desligado (foto/PDF só anexados)."
  type        = string
  default     = "local"
  validation {
    condition     = contains(["local", "vision", "desligado"], var.motor_ocr)
    error_message = "motor_ocr deve ser local, vision ou desligado."
  }
}

variable "gemini_habilitado" {
  description = "Botão \"Analisar com IA\" na conferência da nota: o Gemini (Vertex AI) relê o documento a pedido do usuário. Autentica com a service account do app, sem chave."
  type        = bool
  default     = false
}

variable "gemini_modelo" {
  description = "Modelo do Gemini que lê primeiro (o mais barato)."
  type        = string
  default     = "gemini-3.5-flash-lite"
}

variable "gemini_modelo_reforco" {
  description = "Modelo que relê só quando a leitura barata não fecha (soma dos itens ≠ total). Vazio desliga."
  type        = string
  default     = "gemini-3.5-flash"
}

variable "cnpjs_empresa" {
  description = "Opcional: CNPJs da empresa (separados por vírgula) para conferir o destinatário da nota lida."
  type        = string
  default     = ""
}

variable "app_url" {
  description = "Endereço público do app (ex.: https://obras.suaempresa.com.br). Vazio = URL padrão do Cloud Run."
  type        = string
  default     = ""
  validation {
    condition     = var.app_url == "" || can(regex("^https://[^/]+$", var.app_url))
    error_message = "app_url deve começar com https:// e não ter caminho nem barra no fim."
  }
}

variable "proxy_saltos" {
  description = "Proxies confiáveis à frente do app no X-Forwarded-For: 1 = acesso direto ao Cloud Run; 2 = Load Balancer (Cloud Armor) na frente."
  type        = number
  default     = 1
}

variable "varredura_imagens" {
  description = "Varredura automática de vulnerabilidades (pacotes do sistema e do Node) em cada imagem enviada ao Artifact Registry. Cobrada por imagem (~US$ 0,26)."
  type        = bool
  default     = false
}

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
  description = "E-mail que recebe alertas de indisponibilidade e de segurança e os avisos de segurança do Google. Vazio = sem alerta."
  type        = string
  default     = ""
}
