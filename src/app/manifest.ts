import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão de Obras",
    short_name: "Obras",
    description: "Gestão de obras: notas fiscais, contas a pagar, RDO e medições",
    start_url: "/diario",
    display: "standalone",
    background_color: "#f3f5f6",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
