import type { Metadata } from "next";
import { DecisionsScreen } from "@/components/decisions-screen";

export const metadata: Metadata = { title: "Quyết định" };

export default function DecisionsPage() {
  return <DecisionsScreen />;
}
