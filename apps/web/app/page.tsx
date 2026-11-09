import { Home } from "@/components/home";

// Signed-in visitors go to their own workspace (slug from /me); signed-out visitors to /login.
export default function Page() {
  return <Home />;
}
