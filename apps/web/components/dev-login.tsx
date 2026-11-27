"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SHOW_DEV_LOGIN, getApi } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { safeNext } from "@/lib/nav";

/** `/dev-login?member=<id>[&next=/w/office-hub-dev/...]`: logs in and moves on. Dev only (also used for screenshots). */
export function DevLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const member = params.get("member");
  const next = safeNext(params.get("next"), "/");

  useEffect(() => {
    if (!SHOW_DEV_LOGIN) return setError("Đăng nhập nhanh đã tắt.");
    if (!member) return setError("Thiếu tham số member.");
    const theme = params.get("theme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
      try {
        localStorage.setItem("officehub.theme", theme);
      } catch {
        /* ignore */
      }
    }
    getApi()
      .devLogin(member)
      .then(() => router.replace(next))
      .catch((e) => setError(errorMessage(e)));
  }, [member, next, router]);

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <p role="status" className="text-oh-base text-oh-ink-muted">
        {error ?? "Đang đăng nhập…"}
      </p>
    </main>
  );
}
