import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import Avatar from "@/components/Avatar";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { toDisplayMembers } from "@/lib/display";

export default async function GroupsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/signin");

  const groups = await prisma.group.findMany({
    where: { memberships: { some: { userId } } },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Wordmark href="/groups" />
        <Link
          href="/onboarding"
          className="font-mono text-xs text-cream-dim hover:text-cream"
        >
          Edit profile
        </Link>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 pb-24">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Your groups
            </h1>
            <p className="mt-1 text-cream-dim">
              {groups.length === 0
                ? "No crews yet. Start one and share the link."
                : "Where-should-we-go, solved."}
            </p>
          </div>
          <ButtonLink href="/groups/new" size="sm" className="hidden sm:inline-flex">
            + New group
          </ButtonLink>
        </div>

        {groups.length === 0 ? (
          <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line bg-surface/30 p-10 text-center">
            <p className="text-cream-dim">
              Create a group, invite your friends, and Waypoint will find the spot
              that&apos;s fair for everyone.
            </p>
            <ButtonLink href="/groups/new" size="lg" className="mt-6">
              Start your first group
            </ButtonLink>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {groups.map((g) => {
              const members = toDisplayMembers(g.memberships.map((m) => m.user));
              return (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  className="group flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface/60 p-5 transition-colors hover:border-amber/60"
                >
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-semibold">{g.name}</h2>
                    <p className="mt-0.5 font-mono text-xs text-cream-faint">
                      {members.length} members · {g.inviteCode}
                    </p>
                  </div>
                  <div className="flex items-center -space-x-2">
                    {members.slice(0, 4).map((m) => (
                      <Avatar key={m.id} name={m.name} line={m.line} size={34} />
                    ))}
                    <span className="ml-3 text-cream-faint transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <ButtonLink
          href="/groups/new"
          variant="outline"
          size="lg"
          className="mt-4 w-full sm:hidden"
        >
          + New group
        </ButtonLink>
      </div>
    </main>
  );
}
