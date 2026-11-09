"use client";

import Link from "next/link";
import { EmptyState } from "@officehub/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-6 pt-16">
      <EmptyState
        title="Không tìm thấy trang này"
        mood="curious"
        description="Đường dẫn có thể đã cũ hoặc bạn chưa có quyền xem."
        action={
          <Link href="/" className="rounded-oh-md bg-oh-primary px-4 py-2 text-oh-primary-fg focus-visible:outline-3 focus-visible:outline-oh-focus">
            Về văn phòng
          </Link>
        }
      />
    </main>
  );
}
