// Best-effort cleanup so a shared device doesn't leak one person's data to the next.
import { api } from "@/lib/api";

/** Drop every Cache Storage entry (offline copies of API responses and pages). */
export async function clearCaches(): Promise<void> {
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    // best-effort
  }
}

/** Stop this device receiving the signed-in user's notifications. Call while still signed in. */
export async function unsubscribePushBestEffort(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api.unsubscribePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  } catch {
    // best-effort
  }
}
