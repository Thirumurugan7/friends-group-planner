"use client";

import { motion } from "framer-motion";
import type { LatLng, LineColor } from "@/lib/types";
import { LINE_HEX } from "@/lib/lines";

/** Only the fields the map needs — satisfied by both mock and display members. */
interface MapMember {
  id: string;
  line: LineColor;
  point: LatLng;
}

interface Props {
  members: MapMember[];
  /** Normalized (0–1) meeting point / venue location. */
  target: LatLng;
  /** Highlight one member's line; dim the rest. */
  activeMemberId?: string | null;
  className?: string;
}

// Map a normalized 0–1 point into the padded 0–100 viewBox.
function x(lng: number) {
  return 8 + lng * 84;
}
function y(lat: number) {
  return 8 + lat * 84;
}

// A gently curved path from a member pin to the meeting point.
function curve(from: LatLng, to: LatLng) {
  const x1 = x(from.lng);
  const y1 = y(from.lat);
  const x2 = x(to.lng);
  const y2 = y(to.lat);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicular bow so lines fan out instead of overlapping.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * 0.18;
  const cy = my + dx * 0.18;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export default function ConvergenceMap({
  members,
  target,
  activeMemberId,
  className,
}: Props) {
  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] ${className ?? ""}`}>
      <div className="absolute inset-0 bg-transit-grid opacity-40" aria-hidden />
      <svg
        viewBox="0 0 100 100"
        className="relative block h-full w-full"
        role="img"
        aria-label="Map of everyone's routes converging on the meeting point"
      >
        {/* Routes */}
        {members.map((m, i) => {
          const dim = activeMemberId && activeMemberId !== m.id;
          return (
            <motion.path
              key={m.id}
              d={curve(m.point, target)}
              fill="none"
              stroke={LINE_HEX[m.line]}
              strokeWidth={dim ? 0.6 : 1.1}
              strokeLinecap="round"
              opacity={dim ? 0.25 : 0.9}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: 1.1,
                delay: 0.15 * i,
                ease: "easeInOut",
              }}
            />
          );
        })}

        {/* Member pins */}
        {members.map((m, i) => {
          const dim = activeMemberId && activeMemberId !== m.id;
          return (
            <motion.g
              key={m.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: dim ? 0.35 : 1 }}
              transition={{ delay: 0.15 * i, type: "spring", stiffness: 260, damping: 18 }}
              style={{ transformOrigin: `${x(m.point.lng)}px ${y(m.point.lat)}px` }}
            >
              <circle
                cx={x(m.point.lng)}
                cy={y(m.point.lat)}
                r={2.6}
                fill="var(--color-canvas-deep)"
                stroke={LINE_HEX[m.line]}
                strokeWidth={1.4}
              />
            </motion.g>
          );
        })}

        {/* Meeting point — the amber signal, gently pulsing */}
        <motion.circle
          cx={x(target.lng)}
          cy={y(target.lat)}
          r={6}
          fill="none"
          stroke="var(--color-amber)"
          strokeWidth={0.8}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 1 }}
          style={{ transformOrigin: `${x(target.lng)}px ${y(target.lat)}px` }}
        />
        <motion.circle
          cx={x(target.lng)}
          cy={y(target.lat)}
          r={3.4}
          fill="var(--color-amber)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, type: "spring", stiffness: 300, damping: 15 }}
          style={{ transformOrigin: `${x(target.lng)}px ${y(target.lat)}px` }}
        />
      </svg>
    </div>
  );
}
