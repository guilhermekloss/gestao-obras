resource "google_project_iam_audit_config" "secret_manager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"
  audit_log_config {
    log_type = "ADMIN_READ"
  }
  audit_log_config {
    log_type = "DATA_READ"
  }
}

resource "google_essential_contacts_contact" "seguranca" {
  count                               = var.email_alertas == "" ? 0 : 1
  parent                              = "projects/${var.project_id}"
  email                               = var.email_alertas
  language_tag                        = "pt-BR"
  notification_category_subscriptions = ["SECURITY", "SUSPENSION", "TECHNICAL"]
  depends_on                          = [google_project_service.apis]
}

resource "google_logging_metric" "eventos_seguranca" {
  name   = "${var.app_name}/eventos_seguranca"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.app_name}\" AND jsonPayload.categoria=\"seguranca\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key         = "evento"
      value_type  = "STRING"
      description = "login_falhou, login_bloqueado, bloqueio_aplicado, bloqueio_liberado, sessao_revogada, senha_alterada, acesso_negado_arquivo, upload_recusado"
    }
  }
  label_extractors = {
    evento = "EXTRACT(jsonPayload.evento)"
  }
}

resource "google_logging_metric" "mudancas_iam" {
  name   = "${var.app_name}/mudancas_iam"
  filter = "logName:\"cloudaudit.googleapis.com%2Factivity\" AND (protoPayload.methodName=\"SetIamPolicy\" OR protoPayload.methodName:\"CreateServiceAccountKey\" OR protoPayload.methodName:\"UploadServiceAccountKey\")"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

locals {
  alertas_seguranca = var.email_alertas == "" ? {} : {
    forca_bruta = {
      nome      = "${var.app_name}: muitas falhas de login"
      descricao = "Mais de 30 senhas erradas em 10 minutos — possível ataque de força bruta ou de senhas vazadas. Veja os IPs e e-mails em Logging (jsonPayload.evento=\"login_falhou\")."
      filtro    = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.eventos_seguranca.name}\" AND metric.label.evento=\"login_falhou\" AND resource.type=\"cloud_run_revision\""
      limite    = 30
    }
    bloqueios = {
      nome      = "${var.app_name}: contas bloqueadas por tentativas"
      descricao = "Mais de 3 bloqueios de login em 10 minutos. Confira se é ataque (vários e-mails/IPs) ou alguém esquecendo a senha."
      filtro    = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.eventos_seguranca.name}\" AND metric.label.evento=\"login_bloqueado\" AND resource.type=\"cloud_run_revision\""
      limite    = 3
    }
    arquivos = {
      nome      = "${var.app_name}: acessos negados a arquivos"
      descricao = "Mais de 10 tentativas de abrir fotos/anexos sem permissão em 10 minutos — possível varredura por outro usuário."
      filtro    = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.eventos_seguranca.name}\" AND metric.label.evento=\"acesso_negado_arquivo\" AND resource.type=\"cloud_run_revision\""
      limite    = 10
    }
    iam = {
      nome      = "${var.app_name}: permissões do projeto alteradas"
      descricao = "Alguém mudou uma política IAM ou criou chave de service account. Esperado só ao rodar o bootstrap/Terraform; fora disso, investigue em Logging → cloudaudit activity."
      # entradas de auditoria não têm recurso monitorado próprio: viram "global"
      filtro = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.mudancas_iam.name}\" AND resource.type=\"global\""
      limite = 0
    }
  }
}

resource "google_monitoring_alert_policy" "seguranca" {
  for_each     = local.alertas_seguranca
  display_name = each.value.nome
  combiner     = "OR"

  documentation {
    content   = each.value.descricao
    mime_type = "text/markdown"
  }

  conditions {
    display_name = each.value.nome
    condition_threshold {
      filter          = each.value.filtro
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.limite
      duration        = "0s"
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  notification_channels = google_monitoring_notification_channel.email[*].id
}
