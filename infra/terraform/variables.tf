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
  description = "Máquina do Cloud SQL. db-f1-micro (~US$ 10/mês, 25 conexões) atende o início; db-g1-small (50 conexões) ou db-custom-1-3840 quando crescer."
  type        = string
  default     = "db-f1-micro"
}

variable "db_conexoes_por_instancia" {
  description = "Tamanho do pool do Prisma em cada instância do Cloud Run (connection_limit da DATABASE_URL)."
  type        = number
  default     = 5
  validation {
    condition     = var.db_conexoes_por_instancia >= 2
    error_message = "db_conexoes_por_instancia deve ser pelo menos 2."
  }
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

variable "verificacao_disponibilidade" {
  description = "Uptime check em /api/health a cada 5 min, com alerta de app fora do ar. Mantém o Cloud Run sempre com uma instância ligada; false = o app só sobe quando alguém acessa."
  type        = bool
  default     = false
}

variable "max_instancias" {
  description = "Teto de instâncias (protege custo e o limite de conexões do banco: f1-micro aceita 25, g1-small 50)."
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
  description = "Proxies confiáveis à frente do app no X-Forwarded-For. Deixe 1: com load_balancer = true o app confia no salto do LB sozinho, só nas requisições que trazem o cabeçalho secreto dele (a URL run.app segue aberta e não pode forjar o IP)."
  type        = number
  default     = 1
}

variable "ips_confiaveis" {
  description = "IPs ou faixas CIDR que nunca são bloqueados por IP no login (ex.: \"200.1.2.3, 2804:14c::/32\" do escritório). O limite por e-mail continua valendo. Vazio = nenhum."
  type        = string
  default     = ""
}

variable "load_balancer" {
  description = "Load Balancer HTTPS global com Cloud Armor (WAF e limite por IP na borda) e domínio próprio em app_url. ~US$ 25/mês. Depois do apply, aponte o DNS do domínio para o IP da saída borda_ip."
  type        = bool
  default     = false
}

variable "borda_limite_por_minuto" {
  description = "Cloud Armor: requisições por minuto de um mesmo IP antes de barrar por 10 min. Folgado: o escritório e o 4G dividem IP."
  type        = number
  default     = 1200
}

variable "borda_limite_login_por_minuto" {
  description = "Cloud Armor: envios de login por minuto de um mesmo IP antes de barrar por 15 min."
  type        = number
  default     = 30
}

variable "borda_waf_observacao" {
  description = "true = as regras OWASP do Cloud Armor só registram (preview). Passe para false depois de conferir os falsos positivos no Logging."
  type        = bool
  default     = true
}

variable "ips_bloqueados_borda" {
  description = "IPs ou faixas CIDR barrados no Cloud Armor, antes de chegar ao app (ex.: os de reincidência que não param). Para o dia a dia, use Bloquear IP na tela Usuários."
  type        = list(string)
  default     = []
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

variable "sefaz_agendador" {
  description = "Opcional: agendador de hora em hora da captura de NF-e (Cloud Scheduler, grátis até 3 jobs), para consultar no horário mesmo sem ninguém usando o sistema. Quem liga a captura, escolhe a frequência e envia o certificado é o Admin, na tela Empresa."
  type        = bool
  default     = true
}

variable "sefaz_ca_pem" {
  description = "Opcional: cadeia ICP-Brasil em PEM, se o Node não confiar no certificado do servidor da Sefaz (ex.: file(\"icp-brasil.pem\"))."
  type        = string
  default     = ""
}
