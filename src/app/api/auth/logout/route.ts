import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { revokeCurrentSession, getSession } from "@/lib/auth";
import { auditAction } from "@/lib/tenant";
import { logInfo } from "@/lib/logger";

// FIX-SEGURIDAD H-ALT-004: logout invalida el JWT server-side
// (jti → revokedTokens). Ya no basta con borrar la cookie.
// FIX-SEGURIDAD H-ALT-008: audita logout.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session) {
    await auditAction(
      session,
      "logout",
      "usuario",
      session.userId,
      {},
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );
    logInfo("logout", { userId: session.userId });
  }
  await revokeCurrentSession();
  return ok({ ok: true });
}
