import type { Metadata } from "next";
import { InviteScreen } from "@/components/invite-screen";

export const metadata: Metadata = { title: "Nhận lời mời", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteScreen token={token} />;
}
