import { redirect } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { ButtonLink } from "@/components/Button";
import { getUserId } from "@/lib/session";

const POINTS = [
  ["Fair for everyone", "Real travel times from every friend's area, not a pin in the middle of the map."],
  ["Home on time", "Everyone's ride home is checked against their own home-by time."],
  ["Plan, vote, go", "Pick a day together, vote on itineraries, split costs after."],
];

export default async function Landing() {
  if (await getUserId()) redirect("/groups");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Wordmark />
      <h1 className="mt-16 font-display text-4xl text-balance">Days out that work for the whole group.</h1>
      <ul className="mt-10 space-y-5">
        {POINTS.map(([t, d]) => (
          <li key={t}><p className="font-display text-amber">{t}</p><p className="text-cream-dim">{d}</p></li>
        ))}
      </ul>
      <ButtonLink href="/signin" size="lg" className="mt-auto w-full">Get started</ButtonLink>
    </main>
  );
}
