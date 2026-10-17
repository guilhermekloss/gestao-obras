resource "google_service_account" "run" {
  account_id   = "${var.app_name}-run"
  display_name = "Gestão de Obras — app (Cloud Run)"
}

resource "google_project_iam_member" "run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.run.member
}

resource "google_secret_manager_secret_iam_member" "run_secrets" {
  for_each = {
    database_url   = google_secret_manager_secret.database_url.id
    auth_secret    = google_secret_manager_secret.auth_secret.id
    sefaz_cert_pem = google_secret_manager_secret.sefaz_cert_pem.id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run.member
}

resource "google_project_iam_member" "run_gemini" {
  count   = var.gemini_habilitado ? 1 : 0
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = google_service_account.run.member
}

resource "google_storage_bucket_iam_member" "run_uploads" {
  for_each = toset(["roles/storage.objectCreator", "roles/storage.objectViewer"])
  bucket   = google_storage_bucket.uploads.name
  role     = each.value
  member   = google_service_account.run.member
}

resource "google_service_account" "migrate" {
  account_id   = "${var.app_name}-migrate"
  display_name = "Gestão de Obras — migrations (Cloud Run job)"
}

resource "google_project_iam_member" "migrate_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.migrate.member
}

resource "google_secret_manager_secret_iam_member" "migrate_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.migrate.member
}

resource "google_service_account" "deployer" {
  account_id   = "${var.app_name}-deployer"
  display_name = "Gestão de Obras — deploy (GitHub Actions)"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = google_service_account.deployer.member
}

resource "google_service_account_iam_member" "deployer_act_as" {
  for_each           = { run = google_service_account.run.name, migrate = google_service_account.migrate.name }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
