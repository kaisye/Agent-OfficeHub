import { redirect } from "next/navigation";
import { DEFAULT_SLUG } from "@/lib/api";

// The workspace shell sends signed-out visitors to /login.
export default function Home() {
  redirect(`/w/${DEFAULT_SLUG}`);
}
