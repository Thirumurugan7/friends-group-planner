"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { api } from "@/lib/api";

const input = "min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-lg tracking-wide outline-none focus:border-amber";

const GOOGLE_ERRORS: Record<string, string> = {
  google: "Google sign-in didn't work. Try again or use your phone.",
  "google-email": "That email is already used by an account. Sign in with your phone, then link Google from your profile.",
};

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/groups";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(GOOGLE_ERRORS[params.get("error") ?? ""] ?? null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Wordmark />
      <div className="mt-auto space-y-5">
        <h1 className="font-display text-3xl text-balance">Plan days out that work for everyone.</h1>
        {step === "phone" ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.requestOtp(phone); setStep("code"); }); }}>
            <label className="block">
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">Mobile number</span>
              <input aria-label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>Send code</Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
            const r = await api.verifyOtp(phone, code);
            router.replace(r.needsProfile ? `/onboarding?next=${encodeURIComponent(next)}` : next);
          }); }}>
            <label className="block">
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">Code</span>
              <input aria-label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} className={input} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 4}>Verify</Button>
            <button type="button" className="min-h-11 w-full text-sm text-cream-dim" onClick={() => setStep("phone")}>Change number</button>
          </form>
        )}
        <div className="flex items-center gap-3 text-xs text-cream-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        <a href="/api/auth/google" className="flex min-h-12 w-full items-center justify-center rounded-full border border-line font-display text-[15px] hover:border-amber">
          Continue with Google
        </a>
        {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return <Suspense><SignIn /></Suspense>;
}
