import type { Metadata } from "next";
import { MascotStudio } from "@/components/mascot-studio";

export const metadata: Metadata = { title: "Mascot của tôi" };

export default function MascotPage() {
  return <MascotStudio />;
}
