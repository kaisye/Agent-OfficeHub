import type { Metadata } from "next";
import { AgentsScreen } from "@/components/agents-screen";

export const metadata: Metadata = { title: "Agent của tôi" };

export default function AgentsPage() {
  return <AgentsScreen />;
}
