"use client";

import { Button, EmptyState } from "@officehub/ui";

/** Root error boundary: calm, says the next step, never blames the user. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl p-6 pt-16">
      <EmptyState
        title="Có gì đó trục trặc"
        mood="worried"
        description="Trang này chưa tải được. Bản nháp của bạn vẫn còn, thử lại sau nhé."
        action={
          <div className="flex gap-2">
            <Button variant="primary" onClick={reset}>
              Thử lại
            </Button>
            <Button onClick={() => (window.location.href = "/")}>Về văn phòng</Button>
          </div>
        }
      />
      {process.env.NODE_ENV !== "production" && <pre className="mt-4 overflow-auto rounded-oh-md bg-oh-surface-2 p-3 text-oh-xs">{error.message}</pre>}
    </main>
  );
}
