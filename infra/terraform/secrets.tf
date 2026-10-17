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

# Certificado A1 (PEM: chave + certificado). Só o recipiente: a versão é gravada à mão com gcloud
# (docs/captura-sefaz.md), para a chave privada nunca passar pelo state do Terraform.
resource "google_secret_manager_secret" "sefaz_cert_pem" {
  secret_id = "${var.app_name}-sefaz-cert-pem"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}
