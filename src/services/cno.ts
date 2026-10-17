// CNO (Cadastro Nacional de Obras, IN RFB 1.845/2018): 12 dígitos, impresso como XX.XXX.XXXXX/XX — o mesmo formato da antiga matrícula CEI.
// Não há regra pública confirmada para o dígito verificador: vale só o formato, e o rótulo na nota dá a segurança.

export function normalizarCno(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  return d.length === 12 ? d : null;
}

export function formatarCno(cno: string): string {
  const d = cno.replace(/\D/g, "");
  return d.length === 12 ? d.replace(/^(\d{2})(\d{3})(\d{5})(\d{2})$/, "$1.$2.$3/$4") : cno;
}

const NUMERO = String.raw`(\d{2}[.\s]?\d{3}[.\s]?\d{5}[/\s-]?\d{2})(?!\d)`;
// "TECNO..." não casa: o \b exige que o C comece a palavra
const ROTULO = String.raw`(?:\bC\.?N\.?O\b\.?|\bCEI\b|CADASTRO\s+NACIONAL\s+D[AE]\s+OBRAS?|MATRICULA\s+(?:CEI|DA\s+OBRA))`;
const COM_ROTULO = new RegExp(`${ROTULO}[^\\d]{0,25}?${NUMERO}`, "g");
// com a máscara completa o número é inconfundível (CNPJ é XX.XXX.XXX/XXXX-XX), mesmo sem rótulo
const MASCARADO = /(?<!\d)(\d{2}\.\d{3}\.\d{5}\/\d{2})(?!\d)/g;

// Números distintos, na ordem em que aparecem no texto.
export function extrairCnos(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  const achados: { pos: number; cno: string }[] = [];
  for (const re of [COM_ROTULO, MASCARADO]) {
    for (const m of t.matchAll(re)) {
      const cno = normalizarCno(m[1]);
      if (cno) achados.push({ pos: m.index + m[0].length - m[1].length, cno });
    }
  }
  achados.sort((a, b) => a.pos - b.pos);
  return [...new Set(achados.map((a) => a.cno))];
}
