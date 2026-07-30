import CRMApp from "./crm-app";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await getAuthenticatedUser(true);
  if (!auth) redirect("/login");
  return (
    <CRMApp
      identity={{
        email: auth.user.email,
        displayName: auth.user.fullName || auth.user.email,
      }}
    />
  );
}
