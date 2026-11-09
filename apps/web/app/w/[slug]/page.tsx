import type { Metadata } from "next";
import { BoardScreen } from "@/components/board-screen";

export const metadata: Metadata = { title: "Văn phòng" };

export default function BoardPage() {
  return <BoardScreen />;
}
