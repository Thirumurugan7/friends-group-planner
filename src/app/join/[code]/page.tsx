"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = `/join/${code}`;

  useEffect(() => {
    api.previewJoin(code).then((r) => setGroup(r.group)).catch((err) => {
      if (err instanceof ApiError && err.status === 401) router.replace(`/signin?next=${encodeURIComponent(here)}`);
      else setError("This invite link doesn't work any more. Ask for a new one.");
    });
  }, [code, here, router]);

  async function join() {
    try {
      const r = await api.join(code);
      router.replace(`/groups/${r.groupId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) router.replace(`/onboarding?next=${encodeURIComponent(here)}`);
      else setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Wordmark />
      <div className="mt-auto space-y-4">
        {group && (
          <>
            <h1 className="font-display text-3xl">{group.name}</h1>
            <p className="text-cream-dim">{group.memberCount} {group.memberCount === 1 ? "friend is" : "friends are"} already in.</p>
            <Button size="lg" className="w-full" onClick={join}>Join {group.name}</Button>
          </>
        )}
        {error && <p role="alert" className="text-line-coral">{error}</p>}
      </div>
    </main>
  );
}
