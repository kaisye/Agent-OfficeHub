import { Suspense } from "react";
import type { Metadata } from "next";
import { RequestDetail } from "@/components/request-detail";
import { ListSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Chi tiết yêu cầu" };

export default function RequestDetailPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <RequestDetail />
    </Suspense>
  );
}
