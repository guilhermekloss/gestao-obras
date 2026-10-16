/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  coverageAnalysis: "perTest",
  mutate: [
    "src/services/**/*.ts",
    "src/lib/{format,csp,token}.ts",
    "!src/services/**/__tests__/**",
    "!src/services/leitor-nativo/tipos.ts",
    "!src/services/leitor-nativo/extracao/{tesseract,pdf,imagem,vision,caminhos}.ts",
    "!src/services/{fornecedores,obras}.ts",
  ],
  ignoreStatic: true,
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  timeoutMS: 10000,
  thresholds: { high: 90, low: 80, break: null },
};
