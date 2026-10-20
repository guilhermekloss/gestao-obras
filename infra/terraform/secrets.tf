locals {
  database_url = "postgresql://${google_sql_user.app.name}:${random_password.db.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}&connection_limit=${var.db_conexoes_por_instancia}&pool_timeout=20"

  # max_connections padrão do Cloud SQL por máquina; as demais aceitam ao menos 100.
  db_max_conexoes = lookup({
    "db-f1-micro" = 25
    "db-g1-small" = 50
  }, var.db_tier, 100)

  # +1 instância = revisão nova subindo no deploy; +2 = job de migration e Auth Proxy local.
  db_conexoes_necessarias = (var.max_instancias + 1) * var.db_conexoes_por_instancia + 2
  # 3 ficam reservadas ao superusuário.
  db_conexoes_disponiveis = local.db_max_conexoes - 3
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

  lifecycle {
    precondition {
      condition     = local.db_conexoes_necessarias <= local.db_conexoes_disponiveis
      error_message = "O app pode abrir ${local.db_conexoes_necessarias} conexões ((${var.max_instancias} + 1) instâncias × ${var.db_conexoes_por_instancia} + 2), mas ${var.db_tier} aceita ${local.db_conexoes_disponiveis} (${local.db_max_conexoes} − 3 do superusuário). Reduza max_instancias ou db_conexoes_por_instancia, ou suba db_tier."
    }
  }
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

# Chave do cofre (lib/cofre.ts): cifra no banco o certificado A1 que o Admin envia na tela Empresa.
# Sem ela o app usa uma chave derivada do AUTH_SECRET; o cifrado guarda qual das duas usou.
# Trocar esta chave torna o certificado guardado ilegível: é preciso enviá-lo de novo.
resource "random_bytes" "chave_cofre" {
  length = 32
}

resource "google_secret_manager_secret" "chave_cofre" {
  secret_id = "${var.app_name}-chave-cofre"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "chave_cofre" {
  secret      = google_secret_manager_secret.chave_cofre.id
  secret_data = random_bytes.chave_cofre.base64
}
