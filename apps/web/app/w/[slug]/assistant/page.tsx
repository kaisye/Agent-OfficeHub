import type { Metadata } from "next";
import { AssistantScreen } from "@/components/assistant-screen";

export const metadata: Metadata = { title: "Hỏi trợ lý" };

export default function AssistantPage() {
  return <AssistantScreen />;
}
