# Dispara a captura de NF-e na Sefaz. A cada 20 min, mas a consulta de fato só acontece quando o Admin ligou a
# captura na tela Empresa e a janela de 1 h da Sefaz já passou: na prática, uma consulta a cada 61–80 min.
# Com a captura desligada, a chamada termina na hora (sem custo relevante).
# Chamada com token OIDC desta service account; o app confere e-mail e audiência (/api/sefaz/sincronizar).

resource "google_service_account" "agendador" {
  account_id   = "${var.app_name}-agendador"
  display_name = "Gestão de Obras — agendador da captura Sefaz (Cloud Scheduler)"
}

resource "google_cloud_scheduler_job" "sefaz" {
  count            = var.sefaz_agendador ? 1 : 0
  name             = "${var.app_name}-sefaz-captura"
  region           = var.region
  description      = "Captura de NF-e emitidas contra o CNPJ da empresa (NFeDistribuicaoDFe)"
  schedule         = "*/20 * * * *"
  time_zone        = "America/Sao_Paulo"
  attempt_deadline = "320s"

  # sem nova tentativa: a próxima execução vem em 20 min e reenviar fora de hora não ajuda
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "${local.app_url}/api/sefaz/sincronizar"

    oidc_token {
      service_account_email = google_service_account.agendador.email
      audience              = "${local.app_url}/api/sefaz/sincronizar"
    }
  }

  depends_on = [google_project_service.apis]
}
