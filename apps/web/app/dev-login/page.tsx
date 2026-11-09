import { Suspense } from "react";
import { DevLogin } from "@/components/dev-login";

export const metadata = { title: "Đang đăng nhập" };

export default function DevLoginPage() {
  return (
    <Suspense>
      <DevLogin />
    </Suspense>
  );
}
