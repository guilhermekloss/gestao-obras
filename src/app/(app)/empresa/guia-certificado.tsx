import { BookOpen, Check, X } from "lucide-react";

// Orientação para quem ainda vai pedir o certificado: o que é, o que precisa ter, como pedir, validade e segurança.

const PRECISA_TER: { ok: string; nao?: string }[] = [
  { ok: "Tipo e-CNPJ: emitido para a empresa.", nao: "e-CPF (da pessoa física) não serve." },
  { ok: "Modelo A1: um arquivo .pfx ou .p12, com senha.", nao: "A3 (cartão, token USB ou certificado em nuvem) não serve: não pode ser enviado." },
  { ok: "Padrão ICP-Brasil, emitido por Autoridade Certificadora credenciada." },
  { ok: "CNPJ da matriz cadastrada aqui (ou da mesma raiz, os 8 primeiros dígitos). O da matriz já vale para as filiais." },
  { ok: "Dentro da validade." },
  { ok: "A senha definida na emissão. Sem ela o arquivo não abre." },
];

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

export function GuiaCertificado({ aberto }: { aberto: boolean }) {
  return (
    <details id="guia-certificado" open={aberto} className="group rounded-xl border bg-muted/30 p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
        <BookOpen className="size-4" /> Certificado digital: o que é e como pedir
      </summary>
      <div className="mt-3 space-y-5 text-muted-foreground [&_strong]:text-foreground">
        <Secao titulo="O que é">
          <p>
            É a identidade digital da empresa, emitida no padrão <strong>ICP-Brasil</strong>. A Sefaz só entrega a lista de
            NF-e emitidas contra o CNPJ para quem apresenta o certificado da própria empresa. O sistema também o usa para
            registrar a Ciência da Operação, que libera o XML completo das notas.
          </p>
        </Secao>

        <Secao titulo="O que ele precisa ter">
          <ul className="space-y-1.5">
            {PRECISA_TER.map((item) => (
              <li key={item.ok} className="space-y-0.5">
                <span className="flex gap-2 text-foreground">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-estado-no-prazo-fg" />
                  {item.ok}
                </span>
                {item.nao && (
                  <span className="flex gap-2">
                    <X aria-hidden className="mt-0.5 size-4 shrink-0 text-estado-vencido-fg" />
                    {item.nao}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p>
            Na compra, peça <strong>&quot;certificado digital e-CNPJ A1&quot;</strong>.
          </p>
        </Secao>

        <Secao titulo="Como pedir">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Pergunte ao contador primeiro. Se a empresa já emite nota fiscal, ele provavelmente tem um e-CNPJ A1. O mesmo
              arquivo serve aqui: basta uma cópia do .pfx e a senha.
            </li>
            <li>
              Sem certificado, escolha uma Autoridade Certificadora da ICP-Brasil (Certisign, Serasa Experian, Valid,
              Soluti, Safeweb, entre outras). O preço costuma ficar entre R$ 150 e R$ 300 por ano.
            </li>
            <li>
              A validação é feita com o <strong>representante legal</strong> da empresa, a pessoa responsável pelo CNPJ na
              Receita Federal. Pode ser por videoconferência ou presencial.
            </li>
            <li>
              Documentos que costumam pedir: contrato social ou estatuto (com a última alteração), cartão CNPJ, documento
              com foto e CPF do representante. Confirme a lista com a Autoridade Certificadora.
            </li>
            <li>
              Na emissão, baixe o arquivo .pfx e defina a senha. Se ele for instalado direto num computador, exporte-o
              marcando a opção de exportar a chave privada.
            </li>
            <li>
              Envie aqui, em <strong>&quot;Enviar certificado&quot;</strong>. O sistema confere tudo na hora.
            </li>
          </ol>
        </Secao>

        <Secao titulo="Validade e renovação">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              O A1 vale <strong>1 ano</strong> a partir da emissão. A data exata aparece aqui depois do envio.
            </li>
            <li>O sistema avisa nesta tela e no dashboard 30 dias antes de vencer.</li>
            <li>
              Para renovar, peça um novo e-CNPJ A1. Muitas Autoridades Certificadoras renovam online, sem nova validação,
              enquanto o atual ainda está válido. Depois, envie o arquivo novo aqui. A captura continua de onde parou.
            </li>
            <li>
              Se vencer, a captura para até o envio do novo. Notas dos últimos 90 dias ainda podem ser recuperadas, porque
              é o prazo em que a Sefaz as guarda.
            </li>
          </ul>
        </Secao>

        <Secao titulo="Segurança">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Quem tem o arquivo e a senha age em nome da empresa. Não mande por e-mail ou WhatsApp e guarde uma cópia em
              local protegido.
            </li>
            <li>
              Aqui o certificado fica cifrado e só é usado para consultar NF-e na Sefaz e registrar a Ciência. A senha não é
              guardada.
            </li>
            <li>Se suspeitar de vazamento, peça a revogação à Autoridade Certificadora e envie um novo certificado.</li>
          </ul>
        </Secao>
      </div>
    </details>
  );
}
