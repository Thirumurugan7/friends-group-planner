"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";

const KEY = "waypoint.install.dismissed";
type BIP = Event & { prompt: () => Promise<void> };

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    api.outings().then((r) => { setIos(isIos); setShow(r.outings.length > 0); }).catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-amber/40 bg-surface p-3 text-sm">
        <p className="flex-1">
          {deferred ? "Install Waypoint for quick access and offline plans."
            : ios ? "Tap Share, then Add to Home Screen to install Waypoint."
            : "Add Waypoint to your home screen from your browser menu."}
        </p>
        {deferred && <Button size="sm" onClick={async () => { await deferred.prompt(); dismiss(); }}>Install Waypoint</Button>}
        <button className="min-h-11 px-2 text-cream-faint" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
