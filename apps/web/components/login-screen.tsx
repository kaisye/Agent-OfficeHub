"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Icon, Mascot, useToast } from "@officehub/ui";
import { useQuery } from "@tanstack/react-query";
import { API_MODE, SEED_MEMBERS, SHOW_DEV_LOGIN, getApi } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { safeNext } from "@/lib/nav";

const SEED_HERO = SEED_MEMBERS.find((m) => m.displayName === "Phong")?.mascot ?? SEED_MEMBERS[0]!.mascot;

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const next = safeNext(params.get("next"), "/");
  // http: GET /auth/dev-members (only exists when DEV_LOGIN_ENABLED); mock: the seed members.
  const devMembers = useQuery({ queryKey: ["devMembers"], queryFn: () => getApi().devMembers(), enabled: SHOW_DEV_LOGIN, retry: false });
  const list = devMembers.data ?? [];
  const HERO = list.find((m) => m.displayName === "Phong")?.mascot ?? list[0]?.mascot ?? SEED_HERO;

  const github = () => {
    if (API_MODE === "mock") {
      toast("Chế độ mô phỏng chưa có GitHub. Hãy chọn một thành viên bên dưới.", "info");
      return;
    }
    window.location.href = getApi().githubLoginUrl();
  };

  const devLogin = async (id: string) => {
    setBusy(id);
    try {
      await getApi().devLogin(id);
      router.replace(next);
    } catch (e) {
      toast(errorMessage(e), "danger");
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <div className="oh-bob">
          <Mascot mascot={HERO} mood="relaxed" size={160} title="Linh vật chào bạn" />
        </div>
        <h1 className="mt-4 text-oh-3xl font-bold">Chào mừng đến Office Hub</h1>
        <p className="mt-2 max-w-md text-oh-base text-oh-ink-muted">
          Một văn phòng nhỏ ấm áp, nơi cả nhóm thấy nhau đang làm gì. Agent soạn nháp, còn bạn luôn là người bấm gửi.
        </p>
        <Button variant="primary" size="lg" className="mt-6 w-full max-w-sm" onClick={github}>
          <GithubMark />
          Đăng nhập bằng GitHub
        </Button>
        <p className="mt-2 text-oh-xs text-oh-ink-muted">Chỉ thành viên đã được quản trị viên thêm vào mới vào được.</p>
      </div>

      {SHOW_DEV_LOGIN && (
        <section aria-labelledby="dev-login" className="mt-10 rounded-oh-xl border border-dashed border-oh-border-strong bg-oh-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="dev-login" className="text-oh-lg font-semibold">
              Chọn thành viên
            </h2>
            <span className="rounded-oh-full bg-oh-warning-soft px-2 py-0.5 text-oh-xs text-oh-warning-soft-fg">Chỉ dùng khi phát triển</span>
          </div>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">
            {API_MODE === "mock" ? "Dữ liệu mô phỏng Tripflix, nằm trong trình duyệt." : "Đăng nhập nhanh qua dev-login của API."}
          </p>
          {devMembers.isPending ? (
            <p role="status" className="mt-4 text-oh-sm text-oh-ink-muted">Đang tải danh sách…</p>
          ) : devMembers.isError ? (
            <p role="alert" className="mt-4 text-oh-sm text-oh-danger-soft-fg">
              Chưa lấy được danh sách thành viên. Đăng nhập nhanh chỉ có khi API bật DEV_LOGIN_ENABLED.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {list.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => devLogin(m.id)}
                    aria-label={`Đăng nhập là ${m.displayName}`}
                    className="flex w-full flex-col items-center gap-1 rounded-oh-lg border border-oh-border bg-oh-bg p-3 transition-shadow hover:shadow-oh-md focus-visible:outline-3 focus-visible:outline-oh-focus disabled:opacity-60"
                  >
                    <Mascot mascot={m.mascot} mood="relaxed" size={48} title={m.displayName} />
                    <span className="text-oh-sm font-medium">{m.displayName}</span>
                    <span className="text-oh-xs text-oh-ink-muted">{m.workspaceSlug}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

function GithubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
