"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { errorMessage, post } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await post("/api/auth/login", { email, password });
      window.location.href = next;
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        Sign in to pick up where your clips left off.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            invalid={Boolean(error)}
          />
        </Field>

        <Field label="Password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            invalid={Boolean(error)}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-[12.5px] text-brand-300 underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-brand-300 underline-offset-4 hover:underline">
          Create one free
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full" />}>
      <LoginForm />
    </Suspense>
  );
}
