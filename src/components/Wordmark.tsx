import Link from "next/link";

/** Waypoint wordmark — the amber dot is the meeting-point signal. */
export default function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-cream"
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-amber"
        aria-hidden
      />
      Waypoint
    </Link>
  );
}
