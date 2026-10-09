"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { requestOtp, verifyOtp, joinGroup } from "@/lib/api";

export default function SignIn() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const phoneValid = phone.replace(/\D/g, "").length >= 10;
  const otpValid = otp.every((d) => d !== "");

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phone);
      setStep("otp");
      setTimeout(() => boxes.current[0]?.focus(), 350);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    setError(null);
    if (d && i < 3) boxes.current[i + 1]?.focus();
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { needsProfile: isNew } = await verifyOtp(phone, otp.join(""));

      // If they arrived from an invite link, join that group now.
      const pending = localStorage.getItem("pendingInvite");
      if (pending) {
        localStorage.removeItem("pendingInvite");
        try {
          const { groupId } = await joinGroup(pending);
          router.push(isNew ? "/onboarding" : `/groups/${groupId}`);
          return;
        } catch {
          // fall through to the default destination
        }
      }
      router.push(isNew ? "/onboarding" : "/groups");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-6xl px-6 py-6">
        <Wordmark />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24">
        <AnimatePresence mode="wait">
          {step === "phone" ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="font-display text-3xl font-bold tracking-tight">
                What&apos;s your number?
              </h1>
              <p className="mt-2 text-cream-dim">
                We&apos;ll text you a 4-digit code. No passwords, ever.
              </p>

              <label className="mt-8 block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">
                  Phone number
                </span>
                <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-amber">
                  <span className="font-mono text-cream-dim">+91</span>
                  <input
                    autoFocus
                    inputMode="tel"
                    placeholder="99999 99999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && phoneValid && sendCode()}
                    className="h-14 flex-1 bg-transparent font-mono text-lg tracking-wide outline-none placeholder:text-cream-faint"
                  />
                </div>
              </label>

              {error && (
                <p className="mt-4 text-sm text-line-coral">{error}</p>
              )}
              <Button
                onClick={sendCode}
                disabled={!phoneValid || busy}
                size="lg"
                className="mt-6 w-full"
              >
                {busy ? "Sending…" : "Send code"}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="otp"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Enter the code
              </h1>
              <p className="mt-2 text-cream-dim">
                Sent to +91 {phone || "99999 99999"}.{" "}
                <button
                  onClick={() => setStep("phone")}
                  className="text-amber underline underline-offset-2"
                >
                  Change
                </button>
              </p>

              <div className="mt-8 flex gap-3">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      boxes.current[i] = el;
                    }}
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !d && i > 0)
                        boxes.current[i - 1]?.focus();
                      if (e.key === "Enter" && otpValid) verify();
                    }}
                    className="h-16 w-full rounded-2xl border border-line bg-surface text-center font-mono text-2xl outline-none focus:border-amber"
                  />
                ))}
              </div>

              {error && (
                <p className="mt-4 text-sm text-line-coral">{error}</p>
              )}
              <Button
                onClick={verify}
                disabled={!otpValid || busy}
                size="lg"
                className="mt-6 w-full"
              >
                {busy ? "Verifying…" : "Verify & continue"}
              </Button>
              <button
                onClick={sendCode}
                disabled={busy}
                className="mt-4 block w-full text-center font-mono text-xs text-cream-faint hover:text-cream-dim"
              >
                Didn&apos;t get it? Resend code
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
