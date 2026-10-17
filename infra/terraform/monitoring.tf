resource "google_monitoring_uptime_check_config" "app" {
  display_name = "${var.app_name} /api/health"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.app.uri, "https://")
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_notification_channel" "email" {
  count        = var.email_alertas == "" ? 0 : 1
  display_name = "Alertas ${var.app_name}"
  type         = "email"
  labels = {
    email_address = var.email_alertas
  }
}

resource "google_monitoring_alert_policy" "app_fora_do_ar" {
  count        = var.email_alertas == "" ? 0 : 1
  display_name = "${var.app_name} fora do ar"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check falhando"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.app.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "600s"
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = google_monitoring_notification_channel.email[*].id
}

resource "google_monitoring_alert_policy" "erros_5xx" {
  count        = var.email_alertas == "" ? 0 : 1
  display_name = "${var.app_name} com erros 5xx"
  combiner     = "OR"

  conditions {
    display_name = "Mais de 5 respostas 5xx em 5 minutos"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${google_cloud_run_v2_service.app.name}\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = google_monitoring_notification_channel.email[*].id
}

resource "google_logging_metric" "eventos_sefaz" {
  name   = "${var.app_name}/eventos_sefaz"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.app_name}\" AND jsonPayload.categoria=\"sefaz\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key         = "evento"
      value_type  = "STRING"
      description = "sefaz_captura_falhou, sefaz_bloqueada"
    }
  }
  label_extractors = {
    evento = "EXTRACT(jsonPayload.evento)"
  }
}

resource "google_monitoring_alert_policy" "sefaz_captura" {
  count        = var.email_alertas != "" && var.sefaz_agendador ? 1 : 0
  display_name = "${var.app_name}: captura de NF-e na Sefaz falhando"
  combiner     = "OR"

  documentation {
    content   = "A consulta à Sefaz falhou 3 vezes em 3 horas ou o CNPJ foi bloqueado por consumo indevido (656). Veja o painel Captura Sefaz no app (aba Execuções) e o certificado em Empresa."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Falhas repetidas da captura"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.eventos_sefaz.name}\" AND metric.label.evento=\"sefaz_captura_falhou\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"
      aggregations {
        alignment_period     = "10800s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  conditions {
    display_name = "CNPJ bloqueado pela Sefaz (656)"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.eventos_sefaz.name}\" AND metric.label.evento=\"sefaz_bloqueada\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  alert_strategy {
    auto_close = "21600s"
  }

  notification_channels = google_monitoring_notification_channel.email[*].id
}
