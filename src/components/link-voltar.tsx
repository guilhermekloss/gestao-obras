import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Volta para a tela de origem. Usa o `Button` para ter o alvo de toque de 44 px e o foco do sistema. */
export function LinkVoltar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3" render={<Link href={href} />}>
      <ArrowLeft className="size-4" /> {children}
    </Button>
  );
}
