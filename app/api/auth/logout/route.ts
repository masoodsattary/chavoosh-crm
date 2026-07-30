import { clearSessionCookie, deleteCurrentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function logout() {
  await deleteCurrentSession();
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

export const GET = logout;
export const POST = logout;
