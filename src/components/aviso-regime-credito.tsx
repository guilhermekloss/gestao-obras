import Link from "next/link";
import type { RegimeIbsCbs } from "@prisma/client";

/** Explica por que o efetivo é igual ao bruto quando a empresa não credita IBS/CBS; nada se a empresa é regular. */
export function AvisoRegimeCredito({ regime, admin }: { regime: RegimeIbsCbs; admin: boolean }) {
  if (regime === "REGULAR") return null;
  return (
    <p className="text-sm text-muted-foreground">
      {regime === "NAO_INFORMADO"
        ? "O regime de IBS/CBS da empresa não está informado, então não há crédito na conta e o custo efetivo é igual ao bruto."
        : "A empresa está no Simples Nacional e não aproveita crédito de IBS/CBS, então o custo efetivo é igual ao bruto."}
      {regime === "NAO_INFORMADO" && admin && (
        <>
          {" "}
          <Link href="/empresa" className="underline underline-offset-2">
            Informar na tela Empresa
          </Link>
          .
        </>
      )}
    </p>
  );
}
