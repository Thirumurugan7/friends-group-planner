"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { joinGroup } from "@/lib/api";

interface Preview {
  id: string;
  name: string;
  memberCount: number;
}

export default function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/join/${code}`)
      .then((r) => {
        if (r.status === 401) {
          router.replace(`/signin?next=${encodeURIComponent(`/join/${code}`)}`);
          return null;
        }
        return r.ok ? r.json() : Promise.reject();
      })
      .then((d) => {
        if (d) {
          setPreview(d.group);
        }
      })
      .catch(() => setNotFound(true));
  }, [code, router]);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { groupId } = await joinGroup(code);
      router.push(`/groups/${groupId}`);
    } catch (e) {
      if ((e as Error).message === "Finish your profile first.") {
        router.push(`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`);
        return;
      }
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-md px-6 py-6">
        <Wordmark />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24 text-center">
        {notFound ? (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              This invite isn&apos;t valid
            </h1>
            <p className="mt-3 text-cream-dim">
              The link may be mistyped or the group was removed.
            </p>
            <ButtonLink href="/" variant="outline" size="lg" className="mt-8 w-full">
              Go home
            </ButtonLink>
          </>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-widest text-amber">
              You&apos;re invited
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
              Join {preview?.name ?? "…"}
            </h1>
            <p className="mt-3 text-cream-dim">
              {preview
                ? `${preview.memberCount} ${
                    preview.memberCount === 1 ? "friend is" : "friends are"
                  } in. Add your details and Waypoint folds you into the next plan.`
                : "Loading the group…"}
            </p>

            <p className="mt-6 font-mono text-xs text-cream-faint">
              Invite code · {code.toUpperCase()}
            </p>

            {error && <p className="mt-4 text-sm text-line-coral">{error}</p>}
            <Button
              onClick={join}
              disabled={!preview || busy}
              size="lg"
              className="mt-6 w-full"
            >
              {busy ? "Joining…" : "Join group"}
            </Button>
            <p className="mt-3 text-xs text-cream-faint">
              Takes a minute. No passwords.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
