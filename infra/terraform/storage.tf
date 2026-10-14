# Fotos do diário e anexos das notas. Privado (servido só via /api/fotos com sessão),
# versionado (protege contra exclusão/sobrescrita acidental) e na mesma região.
resource "google_storage_bucket" "uploads" {
  name                        = "${var.project_id}-${var.app_name}-uploads"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  # versões antigas (substituídas/apagadas) somem após 90 dias
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 90
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}
