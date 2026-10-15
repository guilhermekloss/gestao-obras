/**
 * Evento de segurança em JSON numa linha: o Cloud Logging lê `severity` e
 * guarda o resto em `jsonPayload` — as métricas e alertas do Terraform
 * (`infra/terraform/seguranca.tf`) filtram por `jsonPayload.evento`.
 * Nunca inclua senha, token ou conteúdo de documento.
 */
type EventoSeguranca =
  | "login_falhou"
  | "login_bloqueado"
  | "sessao_revogada"
  | "senha_alterada"
  | "acesso_negado_arquivo"
  | "upload_recusado";

export function eventoSeguranca(evento: EventoSeguranca, dados: Record<string, string | number | boolean | null> = {}) {
  console.warn(JSON.stringify({ severity: "WARNING", categoria: "seguranca", evento, ...dados }));
}
