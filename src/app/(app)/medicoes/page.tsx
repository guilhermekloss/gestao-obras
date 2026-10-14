import { redirect } from "next/navigation";

/** Medições virou a seção "Avanço" do Cronograma — mantém links antigos funcionando. */
export default async function MedicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>;
}) {
  const { obra } = await searchParams;
  const params = new URLSearchParams(obra ? { obra, aba: "avanco" } : { aba: "avanco" });
  redirect(`/cronograma?${params.toString()}`);
}
