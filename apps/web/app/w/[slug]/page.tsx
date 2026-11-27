import type { Metadata } from "next";
import { QueueScreen } from "@/components/queue-screen";

export const metadata: Metadata = { title: "Chờ duyệt" };

export default function QueuePage() {
  return <QueueScreen />;
}
