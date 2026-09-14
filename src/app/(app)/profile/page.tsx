"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Save, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Alert, Card, CardHeader, Field, Input, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api, errorMessage, patch } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import type { PublicUser } from "@/lib/serializers";
import type { Plan } from "@/core/domain/plans";
import { AVATAR_COLORS, cn, formatBytes, initials } from "@/lib/utils";

const COLORS = ["violet", "blue", "emerald", "amber", "rose", "cyan"] as const;

export default function ProfilePage() {
  const toast = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stats, setStats] = useState<{ projects: number; clips: number; exports: number } | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("violet");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwError, setPwError] = useState("");

  const load = useCallback(async () => {
    const res = await api<{ user: PublicUser | null; plan: Plan; stats: typeof stats }>("/api/auth/me");
    if (!res.user) return;
    setUser(res.user);
    setPlan(res.plan);
    setStats(res.stats);
    setName(res.user.name);
    setColor(res.user.avatarColor);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await patch<{ user: PublicUser }>("/api/auth/me", { name, avatarColor: color });
      setUser(res.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Could not save", errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (newPassword !== confirmPassword) {
      setPwError("The two new passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await patch("/api/auth/me", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user || !plan) {
    return (
      <>
        <PageHeader title="Profile" subtitle="Loading…" />
        <Skeleton className="h-80 w-full" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account details." />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Account" subtitle="How you appear in the app" action={<UserRound className="h-4 w-4 text-ink-500" />} />
          <form onSubmit={saveProfile} className="space-y-4 px-5 pb-5">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-[20px] font-bold text-white",
                  AVATAR_COLORS[color] ?? AVATAR_COLORS.violet,
                )}
              >
                {initials(name || user.name)}
              </span>
              <div>
                <p className="mb-2 text-[12.5px] text-ink-300">Avatar colour</p>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Use ${c} avatar`}
                      className={cn(
                        "h-7 w-7 rounded-full bg-gradient-to-br ring-offset-2 ring-offset-[var(--surface)] transition-all",
                        AVATAR_COLORS[c],
                        color === c ? "ring-2 ring-white/60" : "hover:scale-110",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </Field>

            <Field label="Email" hint="Contact support to change the email on your account.">
              <Input value={user.email} disabled readOnly />
            </Field>

            <Button type="submit" loading={savingProfile} disabled={name === user.name && color === user.avatarColor}>
              <Save className="h-4 w-4" />
              Save profile
            </Button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Your numbers" subtitle={`Member since ${new Date(user.createdAt).toLocaleDateString()}`} />
            <div className="grid grid-cols-3 gap-3 px-5 pb-5">
              {[
                ["Projects", stats?.projects ?? 0],
                ["Clips", stats?.clips ?? 0],
                ["Exports", stats?.exports ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5 text-center">
                  <p className="text-[22px] font-bold leading-none">{value}</p>
                  <p className="mt-1 text-[11.5px] text-ink-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-white/6 px-5 py-3.5 text-[12.5px] text-muted">
              {plan.name} plan · {user.credits} credits left · {formatBytes(user.storageBytes)} stored
            </div>
          </Card>

          <Card>
            <CardHeader title="Password" subtitle="Changing it signs out every other session" action={<KeyRound className="h-4 w-4 text-ink-500" />} />
            <form onSubmit={savePassword} className="space-y-4 px-5 pb-5">
              {pwError && <Alert>{pwError}</Alert>}
              <Field label="Current password" required>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field label="New password" hint="At least 8 characters, with a letter and a number." required>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </Field>
              <Field label="Confirm new password" required>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Button type="submit" variant="secondary" loading={savingPassword}>
                Change password
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
