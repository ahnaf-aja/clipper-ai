"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { errorMessage, post } from "@/lib/client";
import { cn } from "@/lib/utils";

function strength(pw: string) {
  const checks = [
    { label: "8+ characters", pass: pw.length >= 8 },
    { label: "A letter", pass: /[a-zA-Z]/.test(pw) },
    { label: "A number", pass: /[0-9]/.test(pw) },
  ];
  return { checks, score: checks.filter((c) => c.pass).length };
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { checks, score } = useMemo(() => strength(password), [password]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await post("/api/auth/register", { name, email, password });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        60 free credits. No card required.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            autoComplete="name"
            required
            minLength={2}
          />
        </Field>

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

        <Field label="Password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </Field>

        {password.length > 0 && (
          <div>
            <div className="mb-2 flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i < score ? (score === 3 ? "bg-emerald-500" : "bg-amber-500") : "bg-ink-700",
                  )}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {checks.map((c) => (
                <li
                  key={c.label}
                  className={cn(
                    "flex items-center gap-1 text-[11.5px]",
                    c.pass ? "text-emerald-400" : "text-ink-500",
                  )}
                >
                  <Check className="h-3 w-3" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={score < 3}>
          Create account
        </Button>

        <p className="text-center text-[11.5px] leading-relaxed text-ink-500">
          By creating an account you agree to process only videos you have the rights to use.
        </p>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-300 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full" />}>
      <RegisterForm />
    </Suspense>
  );
}
