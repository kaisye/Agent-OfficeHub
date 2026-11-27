import { Suspense } from "react";
import type { Metadata } from "next";
import { DecisionsScreen } from "@/components/decisions-screen";
import { ListSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Quyết định" };

export default function DecisionsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <DecisionsScreen />
    </Suspense>
  );
}
