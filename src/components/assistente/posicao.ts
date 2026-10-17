export type PosicaoDoBotao = {
  /** Há uma barra de ação fixa nesta tela (no celular, no desktop ou nos dois): o botão sobe acima dela. */
  elevadoNoCelular: boolean;
  elevadoNoDesktop: boolean;
  /** Valores de `bottom` (CSS) por largura. */
  celular: string;
  desktop: string;
};

const BASE_CELULAR = "calc(var(--altura-bottom-nav,0px) + 1rem)";
const BASE_DESKTOP = "1rem";
// altura real de BarraDeAcao (borda + py-3 + botão de até 56 px) com uma folga
const SOBE = "5.5rem";

// Telas com BarraDeAcao: formulários de nota e RDO, importação de XML e seleção em Contas a pagar.
const NOS_DOIS = [
  /^\/notas\/nova$/,
  /^\/notas\/importar-xml$/,
  /^\/notas\/(?!nova$|importar-xml$)[^/]+$/,
  /^\/diario\/novo$/,
  /^\/diario\/[^/]+\/editar$/,
  /^\/contas$/,
];
// A lista do diário só tem a barra "Registrar RDO" no celular (md:hidden).
const SO_NO_CELULAR = [/^\/diario$/];

export function posicaoDoBotao(pathname: string): PosicaoDoBotao {
  const caminho = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const nosDois = NOS_DOIS.some((r) => r.test(caminho));
  const celular = nosDois || SO_NO_CELULAR.some((r) => r.test(caminho));
  return {
    elevadoNoCelular: celular,
    elevadoNoDesktop: nosDois,
    celular: celular ? `calc(${BASE_CELULAR} + ${SOBE})` : BASE_CELULAR,
    desktop: nosDois ? `calc(${BASE_DESKTOP} + ${SOBE})` : BASE_DESKTOP,
  };
}
