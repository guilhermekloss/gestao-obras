import type { DocumentoLido } from "../../../leitura-documento";
import type { Parcela } from "../comum";
import type { Doc, Faixa } from "../documento";
import { encontrarDatas, encontrarValores, normalizarTexto } from "../normalizacao";

export type Resultado = {
  lido: DocumentoLido;
  incompleto?: boolean;
};

export function parcelasDoTrecho(doc: Doc, faixa: Faixa): Parcela[] {
  const r: Parcela[] = [];
  const texto = doc.linhas
    .slice(faixa.de, Math.min(faixa.ate, doc.linhas.length))
    .map((l) => l.texto)
    .join("  ");
  const datas = encontrarDatas(texto);
  const valores = encontrarValores(texto).filter((v) => datas.length > 0 && v.inicio > datas[0].inicio && v.valor > 0);
  if (datas.length > 0 && datas.length === valores.length) {
    return datas.map((d, k) => ({
      vencimento: d.valor,
      valor: valores[k].valor,
    }));
  }
  datas.forEach((d, k) => {
    const limite = datas[k + 1]?.inicio ?? texto.length;
    const v = valores.find((x) => x.inicio >= d.fim && x.inicio < limite);
    if (v && v.valor > 0) r.push({ vencimento: d.valor, valor: v.valor });
  });
  return r;
}

export function telefoneDoTrecho(texto: string): string | null {
  const norm = normalizarTexto(texto);
  const m = /(?:FONE|TEL(?:EFONE)?)[^\d(\n]{0,15}(\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4})(?!\d)/.exec(norm);
  if (!m) return null;
  const ini = m.index + m[0].lastIndexOf(m[1]);
  return texto.slice(ini, ini + m[1].length).trim();
}
