"use client";

import { useEffect } from "react";
import { clearCaches } from "@/lib/device-cleanup";

/** After a Google sign-in (`?fresh=1`), drop any previous user's cached data, then tidy the URL. */
export default function FreshSignIn() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("fresh") !== "1") return;
    url.searchParams.delete("fresh");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void clearCaches();
  }, []);
  return null;
}
