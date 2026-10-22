output "app_url" {
  description = "URL pública do app."
  value       = google_cloud_run_v2_service.app.uri
}

output "github_variables" {
  description = "Variáveis a cadastrar no GitHub (Settings → Secrets and variables → Actions → Variables)."
  value = {
    GCP_PROJECT_ID   = var.project_id
    GCP_REGION       = var.region
    GCP_WIF_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOYER_SA  = google_service_account.deployer.email
  }
}

output "cloud_sql_connection_name" {
  description = "Para conectar localmente com o cloud-sql-proxy."
  value       = google_sql_database_instance.main.connection_name
}

output "uploads_bucket" {
  value = google_storage_bucket.uploads.name
}

output "borda_ip" {
  description = "Com load_balancer = true: aponte o registro A do domínio de app_url para este IP. O certificado só é emitido depois que o DNS responder."
  value       = var.load_balancer ? google_compute_global_address.borda[0].address : null
}
