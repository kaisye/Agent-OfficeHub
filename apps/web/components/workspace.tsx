"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { Member } from "@officehub/shared";
import { isApiError } from "@/lib/api";
import { useMe, useRealtime } from "@/lib/hooks";
import { PageSkeleton } from "./skeletons";
import { TopNav } from "./top-nav";

interface Ctx {
  slug: string;
  me: Member;
}
const WorkspaceCtx = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const v = useContext(WorkspaceCtx);
  if (!v) throw new Error("useWorkspace must be used inside <WorkspaceShell>");
  return v;
}

/** Auth gate + top nav + realtime subscription for everything under /w/[slug]. */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();

  const unauthenticated = me.isError && isApiError(me.error) && (me.error.code === "unauthenticated" || me.error.code === "token_revoked");
  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, router, pathname]);

  if (me.isError && !unauthenticated) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="rounded-oh-lg border border-oh-danger bg-oh-danger-soft p-4 text-oh-danger-soft-fg">
          Chưa kết nối được. Bản nháp của bạn vẫn còn, thử lại sau nhé.
        </p>
        <button className="mt-4 underline" onClick={() => void me.refetch()}>
          Thử lại
        </button>
      </main>
    );
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <PageSkeleton label="Đang mở văn phòng…" />
      </main>
    );
  }
  return (
    <WorkspaceCtx.Provider value={{ slug, me: me.data }}>
      <Realtime slug={slug} />
      <TopNav />
      <main id="main" className="mx-auto w-full min-w-0 max-w-7xl overflow-x-clip px-4 pb-16 pt-6 sm:px-6">
        {children}
      </main>
    </WorkspaceCtx.Provider>
  );
}

function Realtime({ slug }: { slug: string }) {
  useRealtime(slug);
  return null;
}
