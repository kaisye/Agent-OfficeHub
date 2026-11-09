"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Mascot } from "@officehub/ui";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Field, TextInput } from "./form";

/** One-time invite link: the invited member sets their email + password, then lands in the office. */
export function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const info = useQuery({ queryKey: ["invite", token], queryFn: () => getApi().inviteInfo(token), retry: false });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Mật khẩu cần ít nhất 10 ký tự.");
    if (password !== confirm) return setError("Hai lần nhập mật khẩu chưa khớp.");
    setBusy(true);
    try {
      await getApi().acceptInvite({ token, email, password });
      const me = await getApi().me();
      router.replace(`/w/${me.workspaceSlug}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      {info.isPending ? (
        <p role="status" className="text-center text-oh-sm text-oh-ink-muted">Đang mở lời mời…</p>
      ) : info.isError ? (
        <div className="flex flex-col items-center text-center">
          <Mascot mascot={{ buddy: "fern" }} mood="worried" size={120} decorative />
          <h1 className="mt-4 text-oh-2xl font-bold">Link mời không dùng được</h1>
          <p className="mt-2 text-oh-sm text-oh-ink-muted">
            Link có thể đã được dùng hoặc đã quá 48 giờ. Hãy nhờ quản trị viên tạo link mới cho bạn.
          </p>
          <Button className="mt-6" variant="secondary" onClick={() => router.replace("/login")}>
            Về trang đăng nhập
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center text-center">
            <div className="oh-bob">
              <Mascot mascot={info.data.mascot} mood="relaxed" size={160} decorative />
            </div>
            <h1 className="mt-4 text-oh-2xl font-bold">Chào {info.data.displayName}!</h1>
            <p className="mt-2 text-oh-sm text-oh-ink-muted">
              Bạn được mời vào văn phòng <b className="text-oh-ink">{info.data.workspaceName}</b>. Đặt email và mật khẩu để lần sau tự đăng nhập.
            </p>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-3" aria-label="Đặt mật khẩu">
            <Field label="Email">
              {(id) => (
                <TextInput id={id} type="email" autoComplete="email" required value={email} placeholder={info.data.email ?? "ban@congty.vn"} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field label="Mật khẩu" hint="Ít nhất 10 ký tự. Có thể là một câu dễ nhớ.">
              {(id, d) => (
                <TextInput id={id} type="password" autoComplete="new-password" required minLength={10} aria-describedby={d} value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            <Field label="Nhập lại mật khẩu" error={error}>
              {(id, d) => (
                <TextInput id={id} type="password" autoComplete="new-password" required aria-describedby={d} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              )}
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? "Đang vào văn phòng…" : "Vào văn phòng"}
            </Button>
          </form>
        </>
      )}
    </main>
  );
}
