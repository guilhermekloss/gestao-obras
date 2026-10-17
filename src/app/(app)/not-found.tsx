import type { Metadata } from "next";
import { NaoEncontrado } from "@/components/nao-encontrado";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return <NaoEncontrado />;
}
