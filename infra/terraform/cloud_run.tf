locals {
  imagem_inicial_service = "us-docker.pkg.dev/cloudrun/container/hello"
  imagem_inicial_job     = "us-docker.pkg.dev/cloudrun/container/job"
  # URL fixa: o link de convite não depende dos cabeçalhos Host/X-Forwarded-Host da requisição.
  app_url = var.app_url != "" ? var.app_url : "https://${var.app_name}-${data.google_project.this.number}.${var.region}.run.app"
}

resource "google_cloud_run_v2_service" "app" {
  name                 = var.app_name
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  deletion_protection  = true
  invoker_iam_disabled = true # público: a autenticação é a do próprio app

  template {
    service_account                  = google_service_account.run.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "300s"
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = var.min_instancias
      max_instance_count = var.max_instancias
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = local.imagem_inicial_service

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "AUTH_TRUST_HOST"
        value = "true"
      }
      env {
        name  = "APP_URL"
        value = local.app_url
      }
      env {
        # proxies que acrescentam IP ao X-Forwarded-For (1 = só Cloud Run; 2 = com LB): base do bloqueio de login por IP
        name  = "PROXY_SALTOS"
        value = tostring(var.proxy_saltos)
      }
      env {
        name  = "TZ"
        value = "UTC"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "OCR_MOTOR"
        value = var.motor_ocr
      }
      dynamic "env" {
        for_each = { for k, v in { GEMINI_PROJETO = var.project_id, GEMINI_MODELO = var.gemini_modelo, GEMINI_MODELO_REFORCO = var.gemini_modelo_reforco } : k => v if var.gemini_habilitado }
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.cnpjs_empresa == "" ? [] : [1]
        content {
          name  = "CNPJS_EMPRESA"
          value = var.cnpjs_empresa
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 3
        timeout_seconds   = 2
        failure_threshold = 20
      }

      liveness_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    # O Terraform cuida da configuração; o GitHub Actions troca a imagem e promove o tráfego a cada deploy.
    # `template[0].revision` fica de fora: reenviar o nome da última revisão com config nova dá 409.
    ignore_changes = [
      template[0].containers[0].image,
      traffic,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.auth_secret,
    google_secret_manager_secret_iam_member.run_secrets,
    google_project_iam_member.run_sql_client,
  ]
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${var.app_name}-migrate"
  location            = var.region
  deletion_protection = true

  template {
    task_count = 1

    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0
      timeout         = "600s"

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      containers {
        image = local.imagem_inicial_job

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_iam_member.migrate_database_url,
    google_project_iam_member.migrate_sql_client,
  ]
}
