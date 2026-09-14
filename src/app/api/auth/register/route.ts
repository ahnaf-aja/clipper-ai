import { prisma } from "@/infra/db/prisma";
import { hashPassword, passwordProblem } from "@/infra/auth/password";
import { createSession } from "@/infra/auth/session";
import { clientIp, rateLimit } from "@/infra/auth/rate-limit";
import { ok, readJson, route } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { Conflict, Invalid } from "@/core/errors";
import { getPlan } from "@/core/domain/plans";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const ip = clientIp(req);
  rateLimit(`register:${ip}`, { max: 8, windowMs: 60 * 60_000 });

  const body = registerSchema.parse(await readJson(req));

  const problem = passwordProblem(body.password);
  if (problem) throw Invalid(problem);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw Conflict("An account with that email already exists. Try signing in.");

  const plan = getPlan("free");
  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      credits: plan.creditsPerMonth,
      creditsMonth: new Date().toISOString().slice(0, 7),
      avatarColor: ["violet", "blue", "emerald", "amber", "rose", "cyan"][
        Math.floor(Math.random() * 6)
      ],
    },
  });

  await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? "" });

  return ok({ id: user.id, email: user.email, name: user.name });
});
