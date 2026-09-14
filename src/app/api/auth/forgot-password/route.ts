import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/infra/db/prisma";
import { clientIp, rateLimit } from "@/infra/auth/rate-limit";
import { ok, readJson, route } from "@/lib/api";
import { forgotSchema, resetSchema } from "@/lib/validation";
import { hashPassword, passwordProblem } from "@/infra/auth/password";
import { AppError, Invalid } from "@/core/errors";
import { logger } from "@/infra/log/logger";
import { isProd } from "@/core/config";

export const runtime = "nodejs";
const log = logger("auth:reset");

/** Step 1 — request a reset link. */
export const POST = route(async (req) => {
  rateLimit(`forgot:${clientIp(req)}`, { max: 5, windowMs: 60 * 60_000 });
  const { email } = forgotSchema.parse(await readJson(req));

  const user = await prisma.user.findUnique({ where: { email } });

  let devToken: string | undefined;
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    // Wire an email provider here. Until then the link is logged server-side,
    // and returned in the response in development only.
    log.info("password reset requested", { email, link: `/reset-password?token=${token}` });
    if (!isProd) devToken = token;
  }

  // Always the same answer — never reveal whether an account exists.
  return ok({
    message: "If an account exists for that email, a reset link is on its way.",
    devToken,
  });
});

/** Step 2 — consume the token and set a new password. */
export const PUT = route(async (req) => {
  rateLimit(`reset:${clientIp(req)}`, { max: 10, windowMs: 60 * 60_000 });
  const body = resetSchema.parse(await readJson(req));

  const problem = passwordProblem(body.password);
  if (problem) throw Invalid(problem);

  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash: createHash("sha256").update(body.token).digest("hex") },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError("That reset link is invalid or has expired.", 400, "invalid_token");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(body.password) },
    }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Any existing session is now suspect.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return ok({ message: "Password updated. You can sign in now." });
});
