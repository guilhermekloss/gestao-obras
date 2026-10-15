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

  # Bucket passado no init (ver infra/bootstrap.sh): terraform init -backend-config="bucket=..."
  backend "gcs" {
    prefix = "gestao-obras/prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Exigido pela API de orçamentos com credencial de usuário.
  user_project_override = true
  billing_project       = var.project_id

  default_labels = {
    app            = var.app_name
    ambiente       = "producao"
    gerenciado-por = "terraform"
  }
}

data "google_project" "this" {}
