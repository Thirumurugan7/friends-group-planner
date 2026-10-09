"use client";

import dynamic from "next/dynamic";
export type { AreaPoint } from "./LeafletAreaMap";

export default dynamic(() => import("./LeafletAreaMap"), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-[var(--radius-card)] bg-surface" />,
});
