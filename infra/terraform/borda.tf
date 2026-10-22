# Opcional (load_balancer = true): Load Balancer HTTPS global com domínio próprio e Cloud Armor na frente do Cloud Run.
# É o "firewall" do modelo Fail2ban (docs/protecao-ativa.md): o Cloud Armor barra na borda, antes de chegar ao app,
# quem passa do limite de requisições (rate-based ban) e ataques conhecidos (regras OWASP).
# Custo aproximado: ~US$ 18/mês do LB + ~US$ 5/mês da política e US$ 1/mês por regra do Cloud Armor, mais tráfego.
#
# A URL run.app continua aberta (o deploy testa a revisão candidata por ela). Para o IP não ser forjado por quem chama
# direto, o LB injeta o cabeçalho X-Borda-Segredo e só com ele o app confia no salto extra do X-Forwarded-For.

locals {
  borda   = var.load_balancer ? 1 : 0
  dominio = trimprefix(var.app_url, "https://")
  # Cloud Armor aceita até 10 IPs/faixas por regra
  ips_bloqueados_borda = { for i, grupo in chunklist(var.ips_bloqueados_borda, 10) : tostring(i) => grupo }
  # regras OWASP (CRS 3.3) mais úteis para um app Next.js; sensibilidade 1 = menos falso positivo
  waf_regras = {
    sqli      = "sqli-v33-stable"
    xss       = "xss-v33-stable"
    lfi       = "lfi-v33-stable"
    rfi       = "rfi-v33-stable"
    rce       = "rce-v33-stable"
    scanner   = "scannerdetection-v33-stable"
    protocolo = "protocolattack-v33-stable"
  }
}

resource "random_password" "borda" {
  count   = local.borda
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "borda_segredo" {
  count     = local.borda
  secret_id = "${var.app_name}-borda-segredo"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "borda_segredo" {
  count       = local.borda
  secret      = google_secret_manager_secret.borda_segredo[0].id
  secret_data = random_password.borda[0].result
}

resource "google_secret_manager_secret_iam_member" "run_borda_segredo" {
  count     = local.borda
  secret_id = google_secret_manager_secret.borda_segredo[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run.member
}

resource "google_compute_global_address" "borda" {
  count      = local.borda
  name       = "${var.app_name}-ip"
  depends_on = [google_project_service.apis]
}

resource "google_compute_region_network_endpoint_group" "app" {
  count                 = local.borda
  name                  = "${var.app_name}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }
}

resource "google_compute_security_policy" "borda" {
  count       = local.borda
  name        = "${var.app_name}-borda"
  description = "Cloud Armor do ${var.app_name}: limite por IP, login e regras OWASP."

  # 1000: login (página e Auth.js) — o app também limita, mas aqui o abuso nem chega ao Cloud Run
  rule {
    action      = "rate_based_ban"
    priority    = 1000
    description = "Login: muitas requisições do mesmo IP"
    match {
      expr {
        expression = "request.method == 'POST' && (request.path == '/login' || request.path.startsWith('/api/auth/'))"
      }
    }
    rate_limit_options {
      conform_action   = "allow"
      exceed_action    = "deny(429)"
      enforce_on_key   = "IP"
      ban_duration_sec = 900
      rate_limit_threshold {
        count        = var.borda_limite_login_por_minuto
        interval_sec = 60
      }
    }
  }

  # 2000+: IPs bloqueados à mão na borda (ips_bloqueados_borda); o app tem o próprio Bloquear IP para o dia a dia
  dynamic "rule" {
    for_each = local.ips_bloqueados_borda
    content {
      action      = "deny(403)"
      priority    = 2000 + tonumber(rule.key)
      description = "IPs bloqueados na borda (${rule.key})"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = rule.value
        }
      }
    }
  }

  # 3000+: OWASP. Em observação por padrão (só registra): ligue de verdade depois de olhar os falsos positivos no Logging.
  dynamic "rule" {
    for_each = { for i, k in sort(keys(local.waf_regras)) : k => i }
    content {
      action      = "deny(403)"
      priority    = 3000 + rule.value
      preview     = var.borda_waf_observacao
      description = "OWASP ${local.waf_regras[rule.key]}"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('${local.waf_regras[rule.key]}', {'sensitivity': 1})"
        }
      }
    }
  }

  # 9000: limite geral por IP (rate-based ban: o Fail2ban da borda)
  rule {
    action      = "rate_based_ban"
    priority    = 9000
    description = "Muitas requisições do mesmo IP"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action   = "allow"
      exceed_action    = "deny(429)"
      enforce_on_key   = "IP"
      ban_duration_sec = 600
      rate_limit_threshold {
        count        = var.borda_limite_por_minuto
        interval_sec = 60
      }
    }
  }

  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Padrão: liberar"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_compute_backend_service" "app" {
  count                 = local.borda
  name                  = "${var.app_name}-backend"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.borda[0].id
  # só o LB conhece o valor: com ele, o app confia no salto extra do X-Forwarded-For
  custom_request_headers = ["X-Borda-Segredo: ${random_password.borda[0].result}"]

  backend {
    group = google_compute_region_network_endpoint_group.app[0].id
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_managed_ssl_certificate" "app" {
  count = local.borda
  name  = "${var.app_name}-cert"
  managed {
    domains = [local.dominio]
  }

  lifecycle {
    precondition {
      condition     = var.app_url != ""
      error_message = "load_balancer = true precisa de app_url com o domínio próprio (ex.: https://obras.suaempresa.com.br)."
    }
  }
}

resource "google_compute_url_map" "app" {
  count           = local.borda
  name            = "${var.app_name}-https"
  default_service = google_compute_backend_service.app[0].id
}

resource "google_compute_target_https_proxy" "app" {
  count            = local.borda
  name             = "${var.app_name}-https"
  url_map          = google_compute_url_map.app[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.app[0].id]
}

resource "google_compute_global_forwarding_rule" "https" {
  count                 = local.borda
  name                  = "${var.app_name}-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.borda[0].id
  port_range            = "443"
  target                = google_compute_target_https_proxy.app[0].id
}

# HTTP → HTTPS
resource "google_compute_url_map" "redirecionar_https" {
  count = local.borda
  name  = "${var.app_name}-http"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirecionar_https" {
  count   = local.borda
  name    = "${var.app_name}-http"
  url_map = google_compute_url_map.redirecionar_https[0].id
}

resource "google_compute_global_forwarding_rule" "http" {
  count                 = local.borda
  name                  = "${var.app_name}-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.borda[0].id
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirecionar_https[0].id
}
