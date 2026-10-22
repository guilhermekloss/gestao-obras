// Alertas do Terraform filtram por jsonPayload.evento. Nunca inclua senha, token ou conteúdo de documento.
type EventoSeguranca =
  | "login_falhou"
  | "login_bloqueado"
  | "bloqueio_aplicado"
  | "bloqueio_liberado"
  | "sessao_revogada"
  | "senha_alterada"
  | "acesso_negado_arquivo"
  | "upload_recusado"
  | "sefaz_gatilho_recusado";

export function eventoSeguranca(evento: EventoSeguranca, dados: Record<string, string | number | boolean | null> = {}) {
  console.warn(JSON.stringify({ severity: "WARNING", categoria: "seguranca", evento, ...dados }));
}
