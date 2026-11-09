import { Suspense } from "react";
import type { Metadata } from "next";
import { RequestsScreen } from "@/components/requests-screen";
import { ListSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Yêu cầu" };

export default function RequestsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <RequestsScreen />
    </Suspense>
  );
}
