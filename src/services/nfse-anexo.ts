import { storage } from "@/lib/storage";
import { nomeDaUrlXml } from "./arquivos";
import { MAX_CARACTERES_XML } from "./nfe-xml";
import { parseNfseXml, pareceNfse, type Nfse } from "./nfse-xml";

/**
 * NFS-e do XML anexado à nota, para mostrar no estilo do DANFSe sem gerar PDF. Nulo quando o anexo não é XML
 * de NFS-e (ou sumiu do storage). Quem chama já conferiu o acesso à nota: aqui não há checagem de papel.
 */
export async function nfseDoAnexo(anexoUrl: string | null | undefined): Promise<Nfse | null> {
  const nome = anexoUrl ? nomeDaUrlXml(anexoUrl) : null;
  if (!nome) return null;
  let xml: string;
  try {
    const buffer = await storage.ler(nome);
    if (buffer.length > MAX_CARACTERES_XML * 4) return null;
    xml = buffer.toString("utf8");
  } catch {
    return null;
  }
  if (!pareceNfse(xml)) return null;
  const lido = parseNfseXml(xml);
  return lido.ok ? lido.nfse : null;
}
