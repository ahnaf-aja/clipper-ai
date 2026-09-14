import { destroySession } from "@/infra/auth/session";
import { ok, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async () => {
  await destroySession();
  return ok({ signedOut: true });
});
