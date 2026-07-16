import ConvergenceMap from "@/components/ConvergenceMap";
import { ButtonLink } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { MOCK_MEMBERS, MEETING_POINT } from "@/lib/mock";

export default function Home() {
  return (
    <main className="relative flex-1">
      {/* ambient dusk glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(255,180,84,0.12), transparent 70%)",
        }}
        aria-hidden
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <ButtonLink href="/signin" variant="ghost" size="sm">
          Sign in
        </ButtonLink>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-xs uppercase tracking-widest text-cream-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-line-teal" />
            Five people · one fair spot
          </p>

          <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Everyone lives{" "}
            <span className="text-cream-dim">somewhere else.</span>{" "}
            <span className="text-amber">Meet in the middle.</span>
          </h1>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-cream-dim">
            Waypoint finds the cafe, restaurant, or gaming spot that&apos;s
            genuinely fair for the whole group — with routes, travel times, and a
            straight-talking breakdown of why it works.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/signin" size="lg">
              Start a group
            </ButtonLink>
            <ButtonLink href="#how" variant="outline" size="lg">
              See how it works
            </ButtonLink>
          </div>

          <p className="mt-4 font-mono text-xs text-cream-faint">
            Sign in with your phone — no passwords.
          </p>
        </div>

        {/* Signature: the convergence map */}
        <div className="relative">
          <div className="rounded-[calc(var(--radius-card)+6px)] border border-line bg-surface/60 p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
            <ConvergenceMap
              members={MOCK_MEMBERS}
              target={MEETING_POINT}
              className="aspect-square bg-canvas-deep"
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[11px] text-cream-faint">
            {MOCK_MEMBERS.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(--color-line-${m.line})` }}
                />
                {m.home.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-24">
        <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
          {[
            {
              n: "01",
              t: "Everyone joins",
              d: "Share a link. Each friend adds home, work, how they travel, and what they like.",
            },
            {
              n: "02",
              t: "Pick a vibe",
              d: "Cafe, restaurant, or gaming — and roughly when you want to meet.",
            },
            {
              n: "03",
              t: "Get the waypoint",
              d: "Ranked spots with per-person routes and a fair-for-everyone score.",
            },
          ].map((s) => (
            <div key={s.n} className="bg-canvas p-7">
              <span className="font-mono text-sm text-amber">{s.n}</span>
              <h3 className="mt-3 font-display text-xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-dim">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
