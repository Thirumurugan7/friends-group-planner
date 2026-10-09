"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ProfileForm from "@/components/profile/ProfileForm";
import { api, ApiError, type SelfProfile } from "@/lib/api";

function Onboarding() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/groups";
  const [profile, setProfile] = useState<SelfProfile | null | undefined>(undefined);

  useEffect(() => {
    api.me().then((r) => setProfile(r.profile)).catch((err) => {
      if (err instanceof ApiError && err.status === 401) router.replace(`/signin?next=${encodeURIComponent(`/onboarding?next=${next}`)}`);
      else setProfile(null);
    });
  }, [router, next]);

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Wordmark />
      <h1 className="mt-6 font-display text-2xl">Tell your friends where you&apos;re coming from</h1>
      <p className="mt-2 mb-6 text-sm text-cream-dim">Only people in your groups see your area — never your exact address.</p>
      {profile !== undefined && <ProfileForm initial={profile} onSaved={() => router.replace(next)} />}
    </main>
  );
}

export default function OnboardingPage() {
  return <Suspense><Onboarding /></Suspense>;
}
