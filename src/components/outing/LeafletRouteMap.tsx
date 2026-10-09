// src/components/outing/LeafletRouteMap.tsx
"use client";

import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Leg, Stop } from "@/lib/engine/types";

export default function LeafletRouteMap({ stops, legs }: { stops: Stop[]; legs: Leg[] }) {
  const lat = stops.reduce((s, x) => s + x.venue.lat, 0) / stops.length;
  const lng = stops.reduce((s, x) => s + x.venue.lng, 0) / stops.length;
  return (
    <MapContainer center={[lat, lng]} zoom={12} className="h-56 w-full rounded-[var(--radius-card)]" attributionControl={false} scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {legs.filter((l) => l.route.geometry).map((l, i) => (
        <Polyline key={i} positions={l.route.geometry!} pathOptions={{ color: "#ffb454", weight: 4, opacity: 0.8 }} />
      ))}
      {stops.map((s, i) => (
        <CircleMarker key={s.venue.id} center={[s.venue.lat, s.venue.lng]} radius={9} pathOptions={{ color: "#f4f1e8", fillColor: "#ffb454", fillOpacity: 1 }}>
          <Tooltip permanent direction="top">{i + 1}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
