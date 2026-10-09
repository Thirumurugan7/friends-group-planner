"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = L.divIcon({
  className: "",
  html: '<div style="width:20px;height:20px;border-radius:9999px;background:#ffb454;border:3px solid #17162a;box-shadow:0 0 0 4px rgba(255,180,84,.35)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function Follow({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], map.getZoom()); }, [lat, lng, map]);
  return null;
}

function Clicks({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LeafletPicker({
  lat, lng, onPick,
}: { lat: number; lng: number; onPick: (lat: number, lng: number) => void }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} className="h-44 w-full rounded-2xl">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <Marker
        position={[lat, lng]}
        icon={pin}
        draggable
        eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onPick(p.lat, p.lng); } }}
      />
      <Follow lat={lat} lng={lng} />
      <Clicks onPick={onPick} />
    </MapContainer>
  );
}
