#!/usr/bin/env bash
# Prepara o projeto GCP e aplica o Terraform. Rode no Cloud Shell (já tem gcloud e terraform):
#
#   git clone https://github.com/guilhermekloss/gestao-obras.git && cd gestao-obras
#   ./infra/bootstrap.sh SEU_PROJECT_ID
#
# É idempotente: pode rodar de novo para aplicar mudanças da pasta infra/terraform.
set -euo pipefail

PROJECT_ID="${1:?uso: $0 PROJECT_ID [REGIAO]}"
REGION="${2:-southamerica-east1}"
STATE_BUCKET="${PROJECT_ID}-tfstate"
TF_DIR="$(cd "$(dirname "$0")/terraform" && pwd)"
TF_VERSION="1.13.3"

# O Cloud Shell não traz mais o Terraform (o comando lá só imprime instruções).
# Instala em ~/bin, que o Cloud Shell mantém entre sessões.
if ! terraform version 2>/dev/null | grep -q '^Terraform v'; then
  echo "==> Instalando Terraform $TF_VERSION em ~/bin"
  mkdir -p "$HOME/bin"
  curl -fsSL -o /tmp/terraform.zip \
    "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  unzip -o -q /tmp/terraform.zip -d "$HOME/bin" terraform
  rm -f /tmp/terraform.zip
  export PATH="$HOME/bin:$PATH"
  hash -r
fi
terraform version | head -1

echo "==> Projeto: $PROJECT_ID · Região: $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

# Credencial que o Terraform usa (a sua conta, via Application Default Credentials).
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  gcloud auth application-default login
fi
gcloud auth application-default set-quota-project "$PROJECT_ID" >/dev/null 2>&1 || true

echo "==> Habilitando APIs básicas"
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com \
  storage.googleapis.com iam.googleapis.com --project "$PROJECT_ID"

echo "==> Bucket do estado do Terraform: gs://$STATE_BUCKET"
if ! gcloud storage buckets describe "gs://$STATE_BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$STATE_BUCKET" --project "$PROJECT_ID" --location "$REGION" \
    --uniform-bucket-level-access --public-access-prevention
fi
gcloud storage buckets update "gs://$STATE_BUCKET" --versioning >/dev/null

if [[ ! -f "$TF_DIR/terraform.tfvars" ]]; then
  cp "$TF_DIR/terraform.tfvars.example" "$TF_DIR/terraform.tfvars"
  sed -i "s/^project_id = .*/project_id = \"$PROJECT_ID\"/" "$TF_DIR/terraform.tfvars"
  echo "region = \"$REGION\"" >> "$TF_DIR/terraform.tfvars"
  echo
  echo "Criei $TF_DIR/terraform.tfvars. Revise (e-mail de alertas, conta de faturamento) e rode de novo."
  echo "  Contas de faturamento: gcloud billing accounts list"
  exit 0
fi

cd "$TF_DIR"
terraform init -input=false -backend-config="bucket=$STATE_BUCKET"
terraform apply -input=false

echo
echo "==> Cadastre no GitHub: Settings → Secrets and variables → Actions → aba Variables"
terraform output -json github_variables | python3 -c 'import json,sys; [print(f"  {k} = {v}") for k,v in json.load(sys.stdin).items()]'
echo
echo "App: $(terraform output -raw app_url)  (página de exemplo até o primeiro deploy pelo GitHub Actions)"
