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
  # Vision só quando é o motor de OCR escolhido
  apis = concat(
    local.apis_base,
    var.motor_ocr == "vision" ? ["vision.googleapis.com"] : [],
    var.gemini_habilitado ? ["aiplatform.googleapis.com"] : [], # Gemini (análise com IA)
    # varredura automática de vulnerabilidades das imagens a cada push no Artifact Registry
    var.varredura_imagens ? ["containerscanning.googleapis.com"] : [],
  )
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}
