import type { Metadata } from "next";
import { TaskScreen } from "@/components/task-screen";

export const metadata: Metadata = { title: "Bàn giao" };

export default function TaskPage() {
  return <TaskScreen />;
}
