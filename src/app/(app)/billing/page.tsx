"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, HardDrive, Receipt, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Alert, Badge, Card, CardHeader, Progress, Segmented, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api, errorMessage, post } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import type { Plan, PlanId } from "@/core/domain/plans";
import type { PublicUser } from "@/lib/serializers";
import { cn, formatBytes } from "@/lib/utils";

type BillingData = {
  user: PublicUser;
  plan: Plan;
  plans: Plan[];
  usage: {
    creditsRemaining: number; creditsTotal: number; minutesProcessed: number;
    projectsThisMonth: number; storageBytes: number; storageLimitBytes: number;
  };
  invoices: { id: string; plan: string; amountUsd: number; status: string; periodEnd: string; createdAt: string }[];
};

export default function BillingPage() {
  const toast = useToast();
  const [data, setData] = useState<BillingData | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [changing, setChanging] = useState<PlanId | null>(null);

  const load = useCallback(async () => {
    setData(await api<BillingData>("/api/billing"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changePlan = async (planId: PlanId) => {
    setChanging(planId);
    try {
      await post("/api/billing", { plan: planId, cycle });
      await load();
      toast.success("Plan updated", `You're on the ${planId} plan now.`);
    } catch (err) {
      toast.error("Could not change plan", errorMessage(err));
    } finally {
      setChanging(null);
    }
  };

  if (!data) {
    return (
      <>
        <PageHeader title="Billing" subtitle="Loading…" />
        <Skeleton className="h-96 w-full" />
      </>
    );
  }

  const { usage, plan } = data;

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Your plan, usage and invoices."
        action={
          <Segmented
            value={cycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly · save 17%" },
            ]}
          />
        }
      />

      <Alert tone="info">
        This deployment has no payment processor connected. Changing a plan updates your entitlements
        and writes an invoice record immediately so the whole flow is testable — swap in Stripe
        Checkout in front of <code className="font-mono">POST /api/billing</code> to charge for real.
      </Alert>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Current plan"
              subtitle={plan.tagline}
              action={<Badge tone="brand">{plan.name}</Badge>}
            />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
              <Metric icon={Zap} label="Credits left" value={`${usage.creditsRemaining}`} sub={`of ${usage.creditsTotal}`} pct={(usage.creditsRemaining / Math.max(1, usage.creditsTotal)) * 100} />
              <Metric icon={HardDrive} label="Storage" value={formatBytes(usage.storageBytes)} sub={`of ${plan.storageGb} GB`} pct={(usage.storageBytes / Math.max(1, usage.storageLimitBytes)) * 100} />
              <Metric icon={CreditCard} label="This month" value={`${usage.projectsThisMonth}`} sub={`${usage.minutesProcessed} min analysed`} />
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.plans.map((p) => {
              const current = p.id === plan.id;
              const price = cycle === "yearly" ? p.priceYearly : p.priceMonthly;
              return (
                <Card
                  key={p.id}
                  className={cn("flex flex-col p-5", current && "ring-1 ring-brand-500/45")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[15px] font-semibold">{p.name}</h3>
                      <p className="mt-0.5 text-[12.5px] text-muted">{p.tagline}</p>
                    </div>
                    {p.popular && !current && <Badge tone="brand">Popular</Badge>}
                    {current && <Badge tone="success">Current</Badge>}
                  </div>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-[28px] font-bold tracking-tight">${price}</span>
                    <span className="text-[12.5px] text-ink-400">/{cycle === "yearly" ? "yr" : "mo"}</span>
                  </div>

                  <ul className="mt-4 flex-1 space-y-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[12.5px] text-ink-200">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={current ? "secondary" : p.popular ? "primary" : "outline"}
                    className="mt-4 w-full"
                    disabled={current}
                    loading={changing === p.id}
                    onClick={() => changePlan(p.id)}
                  >
                    {current ? "Your plan" : price === 0 ? "Downgrade to Free" : `Switch to ${p.name}`}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>

        <Card>
          <CardHeader title="Invoices" subtitle="Your billing history" action={<Receipt className="h-4 w-4 text-ink-500" />} />
          {data.invoices.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-muted">
              No invoices yet. Paid plans generate one on every change.
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-[13px] font-medium capitalize">{inv.plan} plan</p>
                    <p className="text-[12px] text-muted">
                      {new Date(inv.createdAt).toLocaleDateString()} → {new Date(inv.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[13px]">${inv.amountUsd}</p>
                    <Badge tone="success" className="mt-0.5">{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  pct,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  pct?: number;
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-[22px] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11.5px] text-ink-500">{sub}</p>
      {pct !== undefined && <Progress value={pct} className="mt-2 h-1" />}
    </div>
  );
}
