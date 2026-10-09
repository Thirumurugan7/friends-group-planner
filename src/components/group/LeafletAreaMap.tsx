"use client";

import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LineColor } from "@/lib/types";

const HEX: Record<LineColor, string> = {
  teal: "#3dd6c4", coral: "#ff6b6b", violet: "#a78bfa", lime: "#b6e24a", sky: "#5aa9ff", rose: "#f78fb3",
};

export interface AreaPoint { id: string; name: string; lat: number; lng: number; line: LineColor }

export default function LeafletAreaMap({ points }: { points: AreaPoint[] }) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return (
    <MapContainer center={[lat, lng]} zoom={11} className="h-48 w-full rounded-[var(--radius-card)]" attributionControl={false} scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p) => (
        // Radius ~1km circles: these are areas, not addresses.
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={14} pathOptions={{ color: HEX[p.line], fillOpacity: 0.35 }}>
          <Tooltip>{p.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
