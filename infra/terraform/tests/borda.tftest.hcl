mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789" }
  }
  mock_resource "google_service_account" {
    defaults = {
      member = "serviceAccount:conta-teste@projeto-teste.iam.gserviceaccount.com"
      email  = "conta-teste@projeto-teste.iam.gserviceaccount.com"
      name   = "projects/projeto-teste/serviceAccounts/conta-teste@projeto-teste.iam.gserviceaccount.com"
    }
  }
}
mock_provider "random" {}

variables {
  project_id = "projeto-teste"
}

run "sem_load_balancer" {
  command = plan
  assert {
    condition     = length(google_compute_security_policy.borda) == 0 && length(google_secret_manager_secret.borda_segredo) == 0
    error_message = "Sem load_balancer não deve criar nada da borda."
  }
}

run "com_load_balancer" {
  command = apply
  variables {
    load_balancer        = true
    app_url              = "https://obras.exemplo.com.br"
    ips_bloqueados_borda = ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5", "6.6.6.6", "7.7.7.7", "8.8.8.8", "9.9.9.9", "10.0.0.0/8", "11.1.1.1"]
  }
  assert {
    condition     = google_compute_managed_ssl_certificate.app[0].managed[0].domains[0] == "obras.exemplo.com.br"
    error_message = "Certificado deve ser do domínio de app_url."
  }
  assert {
    # login + 2 grupos de IPs (10 + 1) + 7 OWASP + geral + padrão
    condition     = length(google_compute_security_policy.borda[0].rule) == 12
    error_message = "Quantidade de regras do Cloud Armor inesperada."
  }
  assert {
    condition     = alltrue([for r in google_compute_security_policy.borda[0].rule : r.preview if r.priority >= 3000 && r.priority < 4000])
    error_message = "Regras OWASP devem começar em observação."
  }
}

run "load_balancer_sem_dominio" {
  command = plan
  variables {
    load_balancer = true
  }
  expect_failures = [google_compute_managed_ssl_certificate.app]
}
