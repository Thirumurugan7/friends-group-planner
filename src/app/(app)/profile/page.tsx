"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileForm from "@/components/profile/ProfileForm";
import { Button } from "@/components/Button";
import PushToggle from "@/components/shell/PushToggle";
import { api, type SelfProfile } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.me().then((r) => setProfile(r.profile)); }, []);

  if (!profile) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />;
  return (
    <>
      <h1 className="mb-6 font-display text-2xl">Profile</h1>
      <section className="mb-6 space-y-3 rounded-[var(--radius-card)] border border-line p-4">
        <p className="text-sm text-cream-dim">{profile.phone ? `Phone: +${profile.phone}` : "No phone linked"}</p>
        {profile.googleLinked ? (
          <p className="text-sm text-cream-dim">Google account linked</p>
        ) : (
          <a href="/api/auth/google?link=1" className="inline-flex min-h-11 items-center text-sm text-amber">Link Google account</a>
        )}
        <PushToggle />
        <Button variant="outline" size="sm" onClick={async () => {
          await api.signOut();
          if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
          router.replace("/signin");
        }}>Sign out</Button>
      </section>
      {saved && <p role="status" className="mb-4 text-sm text-line-lime">Saved.</p>}
      <ProfileForm initial={profile} onSaved={(p) => { setProfile(p); setSaved(true); }} barClassName="bottom-[calc(3.5rem+env(safe-area-inset-bottom))]" />
    </>
  );
}
