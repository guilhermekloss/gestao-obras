import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Sem isso, o Next 16 bloqueia por segurança as requisições de dev (inclusive
   * o WebSocket de hot-reload) vindas de qualquer origem que não seja localhost.
   * Isso deixa a página carregada mas sem reagir a cliques — é o que acontecia
   * ao testar pelo celular via IP da rede local. O padrão cobre qualquer IP
   * 192.168.x.x, então continua funcionando mesmo se o roteador trocar o IP.
   */
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
