import { prisma } from "@/infra/db/prisma";
import { verifyPassword } from "@/infra/auth/password";
import { createSession } from "@/infra/auth/session";
import { clientIp, rateLimit } from "@/infra/auth/rate-limit";
import { ok, readJson, route } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { AppError } from "@/core/errors";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const body = loginSchema.parse(await readJson(req));

  // Limit by IP and by account, so one attacker cannot lock out everybody.
  rateLimit(`login:ip:${ip}`, { max: 20, windowMs: 15 * 60_000 });
  rateLimit(`login:acct:${body.email}`, { max: 10, windowMs: 15 * 60_000 });

  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // Constant-ish work whether or not the account exists.
  const valid = user
    ? await verifyPassword(body.password, user.passwordHash)
    : await verifyPassword(body.password, "scrypt$16384$8$1$00$00");

  if (!user || !valid) {
    throw new AppError("Email or password is incorrect.", 401, "invalid_credentials");
  }

  await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? "" });
  return ok({ id: user.id, email: user.email, name: user.name });
});
