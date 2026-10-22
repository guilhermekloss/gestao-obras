locals {
  apis_base = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "essentialcontacts.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ]
  apis = concat(
    local.apis_base,
    var.motor_ocr == "vision" ? ["vision.googleapis.com"] : [],
    var.gemini_habilitado ? ["aiplatform.googleapis.com"] : [],
    var.varredura_imagens ? ["containerscanning.googleapis.com"] : [],
    var.sefaz_agendador ? ["cloudscheduler.googleapis.com"] : [],
    var.load_balancer ? ["compute.googleapis.com"] : [],
  )
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}
