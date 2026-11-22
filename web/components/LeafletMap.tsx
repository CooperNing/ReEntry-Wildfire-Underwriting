"use client";
// Client-only map (imported with next/dynamic, ssr: false).
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export type MapPoint = {
  id: string; lat: number; lon: number; color: string; radius: number; label: string; opacity?: number;
};

function FitBounds({ points, fitKey }: { points: MapPoint[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
    map.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], { padding: [20, 20], maxZoom: 13 });
    // fit only when the filter changes, not on every recolor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

export default function LeafletMap({
  points, height = 420, fitKey = "", onSelect, dark = false,
}: { points: MapPoint[]; height?: number; fitKey?: string; onSelect?: (id: string) => void; dark?: boolean }) {
  return (
    <div style={{ height }} className="rounded-xl overflow-hidden border border-line">
      <MapContainer center={[36.8, -119.4]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          key={dark ? "dark" : "light"}
          attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          url={`https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/${dark ? "World_Dark_Gray_Base" : "World_Light_Gray_Base"}/MapServer/tile/{z}/{y}/{x}`}
          maxZoom={16}
        />
        <FitBounds points={points} fitKey={fitKey} />
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={p.radius}
            pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: p.opacity ?? 0.55, weight: 1 }}
            eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
          >
            <Tooltip>{p.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
