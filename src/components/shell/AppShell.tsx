"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import InstallPrompt from "./InstallPrompt";
import FreshSignIn from "./FreshSignIn";

const TABS = [
  { href: "/groups", label: "Groups", icon: "◎" },
  { href: "/outings", label: "Outings", icon: "◇" },
  { href: "/profile", label: "Profile", icon: "○" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <FreshSignIn />
        <InstallPrompt />
        {children}
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map((t) => {
            const active = path === t.href || path.startsWith(`${t.href}/`);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "text-amber" : "text-cream-faint"}`}>
                  <span aria-hidden className="text-lg leading-none">{t.icon}</span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
