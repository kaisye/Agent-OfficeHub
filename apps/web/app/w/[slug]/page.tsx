import { Suspense } from "react";
import type { Metadata } from "next";
import { BoardScreen } from "@/components/board-screen";
import { PageSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Văn phòng" };

export default function BoardPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Đang tải văn phòng…" />}>
      <BoardScreen />
    </Suspense>
  );
}
