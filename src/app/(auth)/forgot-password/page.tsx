"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage, post } from "@/lib/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Second phase — used when the dev reset token is available locally.
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [reset, setReset] = useState(false);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await post<{ message: string; devToken?: string }>(
        "/api/auth/forgot-password",
        { email },
      );
      setSent(true);
      setDevToken(res.devToken);
      if (res.devToken) setToken(res.devToken);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const applyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "PUT",
        body: JSON.stringify({ token, password }),
      });
      setReset(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (reset) {
    return (
      <>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/25">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="text-[26px] font-bold tracking-tight">Password updated</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          All existing sessions were signed out. Use your new password to sign back in.
        </p>
        <Button href="/login" size="lg" className="mt-6 w-full">
          Go to sign in
        </Button>
      </>
    );
  }

  if (sent) {
    return (
      <>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-400 ring-1 ring-brand-500/25">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="text-[26px] font-bold tracking-tight">Check your inbox</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          If an account exists for <span className="text-ink-200">{email}</span>, a reset link is on
          its way. The link expires in one hour.
        </p>

        {devToken && (
          <form onSubmit={applyReset} className="mt-6 space-y-4">
            <Alert tone="info">
              No email provider is configured, so the reset token is returned here in development.
              Set one up before going live.
            </Alert>
            {error && <Alert>{error}</Alert>}
            <Field label="Reset token">
              <Input value={token} onChange={(e) => setToken(e.target.value)} required />
            </Field>
            <Field label="New password" hint="At least 8 characters, with a letter and a number.">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Set new password
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-[13px] text-muted">
          <Link href="/login" className="text-brand-300 underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={request} className="mt-7 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-300 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
