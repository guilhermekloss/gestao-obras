/**
 * Reduz a foto no navegador antes do envio: foto de celular tem 3–8 MB e
 * 4000+ px, o que deixa o upload lento no canteiro e passa do limite do
 * leitor. 2400 px no lado maior mantém legível a letra miúda de um DANFE.
 * Também converte HEIC (iPhone) e PNG para JPEG. Se o navegador não
 * conseguir decodificar a imagem, devolve o arquivo original.
 */
const LADO_MAXIMO = 2400;
const QUALIDADE = 0.85;

export async function prepararFoto(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/")) return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    // fundo branco: PNG com transparência viraria preto no JPEG
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE));
    if (!blob || (escala === 1 && arquivo.type === "image/jpeg" && blob.size >= arquivo.size)) return arquivo;
    const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}
