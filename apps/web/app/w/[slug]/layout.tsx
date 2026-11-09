import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
