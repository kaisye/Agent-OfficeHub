"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FALLBACK_SLUG, isApiError } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { PageSkeleton } from "./skeletons";

/** `/`: resolves the workspace from `Me` instead of a build-time env var. */
export function Home() {
  const router = useRouter();
  const me = useMe();
  const unauth = me.isError && isApiError(me.error) && (me.error.code === "unauthenticated" || me.error.code === "token_revoked");
  const slug = me.data?.workspaceSlug ?? (me.isError && !unauth ? FALLBACK_SLUG : null);

  useEffect(() => {
    if (unauth) router.replace("/login");
    else if (slug) router.replace(`/w/${slug}`);
  }, [unauth, slug, router]);

  if (me.isError && !unauth && !slug) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="rounded-oh-lg border border-oh-danger bg-oh-danger-soft p-4 text-oh-danger-soft-fg">
          Chưa kết nối được. Thử lại sau nhé.
        </p>
        <button className="mt-4 underline" onClick={() => void me.refetch()}>
          Thử lại
        </button>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageSkeleton label="Đang mở văn phòng…" />
    </main>
  );
}
