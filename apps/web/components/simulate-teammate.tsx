"use client";

import { Button, useToast } from "@officehub/ui";
import { API_MODE, SHOW_DEV_LOGIN, getApi, type createMockClient } from "@/lib/api";
import { useWorkspace } from "./workspace";

/** Dev-only demo control (mock mode + NEXT_PUBLIC_DEV_LOGIN): makes a random teammate change presence or reply. */
export function SimulateTeammate({ slug }: { slug: string }) {
  const toast = useToast();
  const { me } = useWorkspace();
  if (API_MODE !== "mock" || !SHOW_DEV_LOGIN) return null;
  const simulate = () => {
    const api = getApi() as ReturnType<typeof createMockClient>;
    toast(api.server.simulateTeammate(slug, me.id), "info");
  };
  return (
    <Button variant="secondary" size="sm" icon="bot" onClick={simulate} title="Chỉ có khi phát triển (chế độ mô phỏng)">
      Giả lập đồng đội
    </Button>
  );
}
