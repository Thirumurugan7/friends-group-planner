import Wordmark from "@/components/Wordmark";

export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Wordmark />
      <h1 className="mt-16 font-display text-2xl">You&apos;re offline</h1>
      <p className="mt-2 text-cream-dim">Locked plans you&apos;ve opened before still work offline. Everything else comes back when you reconnect.</p>
    </main>
  );
}
