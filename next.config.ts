import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // câmera liberada para a própria origem: o diário e os lançamentos tiram foto pelo celular
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  /**
   * Sem isso, o Next 16 bloqueia por segurança as requisições de dev (inclusive
   * o WebSocket de hot-reload) vindas de qualquer origem que não seja localhost.
   * Isso deixa a página carregada mas sem reagir a cliques — é o que acontecia
   * ao testar pelo celular via IP da rede local. O padrão cobre qualquer IP
   * 192.168.x.x, então continua funcionando mesmo se o roteador trocar o IP.
   */
  allowedDevOrigins: ["192.168.*.*"],
  /** Imagem Docker enxuta para o Cloud Run (ver Dockerfile). */
  output: "standalone",
  /** Proteção contra version skew durante o rollout de uma nova revisão (SHA do commit, vindo do build). */
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
  poweredByHeader: false,
  /**
   * Pacotes que carregam WASM, workers ou arquivos de dados em tempo de
   * execução: ficam fora do bundle e são lidos de node_modules.
   */
  serverExternalPackages: [
    "@google-cloud/storage",
    "@google/genai",
    "google-auth-library",
    "sharp",
    "tesseract.js",
    "tesseract.js-core",
    "unpdf",
    "zxing-wasm",
  ],
  /**
   * Leitor nativo de nota (`services/leitor-nativo/extracao`): o worker do
   * Tesseract é aberto por caminho de arquivo e o modelo de português e o
   * WASM do zxing são lidos do disco — o tracing não enxerga nada disso.
   * Todas as variantes do core: no Node o tesseract.js 7 escolhe a variante
   * sem `-lstm` mesmo com `OEM.LSTM_ONLY` (passa um booleano no lugar do OEM).
   */
  outputFileTracingIncludes: {
    "/notas/nova": [
      "./node_modules/tesseract.js/package.json",
      "./node_modules/tesseract.js/src/**/*",
      "./node_modules/tesseract.js-core/package.json",
      "./node_modules/tesseract.js-core/tesseract-core*",
      "./node_modules/@tesseract.js-data/por/package.json",
      "./node_modules/@tesseract.js-data/por/4.0.0_best_int/*",
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs}/**/*",
      "./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
