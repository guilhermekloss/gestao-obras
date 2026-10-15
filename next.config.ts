import type { NextConfig } from "next";

// A Content-Security-Policy sai do src/proxy.ts (nonce novo por requisição).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // Teste pelo celular via IP da LAN: sem isso o Next 16 bloqueia o HMR e a página não reage a cliques.
  allowedDevOrigins: ["192.168.*.*"],
  output: "standalone",
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
  poweredByHeader: false,
  // Carregam WASM, workers ou arquivos de dados em runtime: ficam fora do bundle.
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
  // Worker do Tesseract, modelo de português e WASM do zxing são lidos do disco: o tracing não os enxerga.
  // Todas as variantes do core: no Node o tesseract.js 7 escolhe a sem `-lstm` mesmo com OEM.LSTM_ONLY.
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
