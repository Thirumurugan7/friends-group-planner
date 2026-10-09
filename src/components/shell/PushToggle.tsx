"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";

function key(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushToggle() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const [supported, setSupported] = useState(false);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vapid || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    Promise.resolve().then(() => setSupported(true));
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then(setSub).catch(() => {});
  }, [vapid]);

  if (!supported) {
    return <p className="text-xs text-cream-faint">Notifications need the installed app (on iPhone: Share → Add to Home Screen).</p>;
  }

  async function on() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(vapid) });
      await api.subscribePush(s.toJSON());
      setSub(s);
    } catch {
      setError("Notifications were blocked. You can allow them in your browser settings.");
    }
  }
  async function off() {
    if (!sub) return;
    await api.unsubscribePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
    setSub(null);
  }

  return (
    <div>
      {sub
        ? <Button size="sm" variant="outline" onClick={off}>Turn off notifications</Button>
        : <Button size="sm" variant="outline" onClick={on}>Turn on notifications</Button>}
      {error && <p role="alert" className="mt-1 text-xs text-line-coral">{error}</p>}
    </div>
  );
}
