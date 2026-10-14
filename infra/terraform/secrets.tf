# Segredos ficam no Secret Manager, replicados só na região do app.
# DATABASE_URL e AUTH_SECRET são gerados aqui; ANTHROPIC_API_KEY é adicionada por você.
locals {
  database_url = "postgresql://${google_sql_user.app.name}:${random_password.db.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}&connection_limit=5"
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.app_name}-database-url"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.database_url
}

resource "random_password" "auth_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "auth_secret" {
  secret_id = "${var.app_name}-auth-secret"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "auth_secret" {
  secret      = google_secret_manager_secret.auth_secret.id
  secret_data = random_password.auth_secret.result
}

# Criado vazio. Adicione a chave com:
#   printf '%s' 'sk-ant-...' | gcloud secrets versions add gestao-obras-anthropic-api-key --data-file=-
# e depois rode o terraform com leitura_ia_habilitada = true.
resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "${var.app_name}-anthropic-api-key"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}
