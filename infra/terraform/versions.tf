terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.7"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # Estado remoto num bucket GCS versionado (criado pelo infra/bootstrap.sh).
  # O nome do bucket é passado no init: terraform init -backend-config="bucket=..."
  backend "gcs" {
    prefix = "gestao-obras/prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Necessário para a API de orçamentos (billingbudgets) com credencial de usuário.
  user_project_override = true
  billing_project       = var.project_id

  default_labels = {
    app            = var.app_name
    ambiente       = "producao"
    gerenciado-por = "terraform"
  }
}

data "google_project" "this" {}
