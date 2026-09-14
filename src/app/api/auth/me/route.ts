import { prisma } from "@/infra/db/prisma";
import { getCurrentUser, requireUser } from "@/infra/auth/session";
import { verifyPassword, hashPassword, passwordProblem } from "@/infra/auth/password";
import { ok, readJson, route } from "@/lib/api";
import { updateProfileSchema } from "@/lib/validation";
import { AppError, Invalid } from "@/core/errors";
import { getPlan } from "@/core/domain/plans";
import { toPublicUser } from "@/lib/serializers";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });

  const [projects, clips, exports] = await Promise.all([
    prisma.project.count({ where: { userId: user.id } }),
    prisma.clip.count({ where: { userId: user.id, archived: false } }),
    prisma.exportJob.count({ where: { userId: user.id } }),
  ]);

  return ok({
    user: toPublicUser(user),
    plan: getPlan(user.plan),
    stats: { projects, clips, exports },
  });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const body = updateProfileSchema.parse(await readJson(req));

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.avatarColor) data.avatarColor = body.avatarColor;

  if (body.newPassword) {
    if (!body.currentPassword) throw Invalid("Enter your current password to change it.");
    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) throw new AppError("Current password is incorrect.", 401, "invalid_credentials");
    const problem = passwordProblem(body.newPassword);
    if (problem) throw Invalid(problem);
    data.passwordHash = await hashPassword(body.newPassword);
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return ok({ user: toPublicUser(updated) });
});
