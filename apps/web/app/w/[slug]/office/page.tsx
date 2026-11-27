import { Suspense } from "react";
import type { Metadata } from "next";
import { OfficeScreen } from "@/components/office-screen";
import { PageSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Văn phòng" };

export default function OfficePage() {
  return (
    <Suspense fallback={<PageSkeleton label="Đang tải văn phòng…" />}>
      <OfficeScreen />
    </Suspense>
  );
}
