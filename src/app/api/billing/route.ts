import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { rateLimit } from "@/infra/auth/rate-limit";
import { ok, readJson, route } from "@/lib/api";
import { changePlanSchema } from "@/lib/validation";
import { getPlan, PLANS } from "@/core/domain/plans";
import { toPublicUser } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();

  const [invoices, usage] = await Promise.all([
    prisma.invoice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.project.aggregate({
      where: { userId: user.id, createdAt: { gte: startOfMonth() } },
      _sum: { durationSec: true },
      _count: true,
    }),
  ]);

  const plan = getPlan(user.plan);

  return ok({
    user: toPublicUser(user),
    plan,
    plans: PLANS,
    usage: {
      creditsRemaining: user.credits,
      creditsTotal: plan.creditsPerMonth,
      minutesProcessed: Math.round((usage._sum.durationSec ?? 0) / 60),
      projectsThisMonth: usage._count,
      storageBytes: Number(user.storageBytes),
      storageLimitBytes: plan.storageGb * 1024 ** 3,
    },
    invoices: invoices.map((i) => ({
      id: i.id,
      plan: i.plan,
      amountUsd: i.amountUsd,
      status: i.status,
      periodEnd: i.periodEnd.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  });
});

/**
 * Plan change.
 *
 * There is no payment processor wired up: this records the plan change and
 * writes a matching invoice row so the whole billing surface is exercisable
 * end to end. Drop a Stripe checkout session in front of this handler and the
 * rest of the app needs no changes.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`billing:${user.id}`, { max: 10, windowMs: 60_000 });

  const body = changePlanSchema.parse(await readJson(req));
  const plan = getPlan(body.plan);
  const amount = body.cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;

  const periodEnd = new Date();
  if (body.cycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: {
        plan: plan.id,
        // Top up to the new allowance without removing credits already bought.
        credits: Math.max(user.credits, plan.creditsPerMonth),
        creditsMonth: new Date().toISOString().slice(0, 7),
      },
    });
    if (amount > 0) {
      await tx.invoice.create({
        data: { userId: user.id, plan: plan.id, amountUsd: amount, status: "paid", periodEnd },
      });
    }
    return u;
  });

  return ok({ user: toPublicUser(updated), plan });
});

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
