// src/components/outing/RouteMap.tsx
"use client";

import dynamic from "next/dynamic";

export default dynamic(() => import("./LeafletRouteMap"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-[var(--radius-card)] bg-surface" />,
});
