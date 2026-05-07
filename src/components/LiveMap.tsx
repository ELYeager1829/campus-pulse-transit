import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface BusMarker { id: string; bus_number: string; lat: number; lng: number; status?: string }

// Fix default marker icons in bundlers
const icon = L.divIcon({
  className: "",
  html: `<div style="background:linear-gradient(135deg,oklch(0.78 0.16 70),oklch(0.85 0.18 80));width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#1a1f3a;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,.25);font-weight:700;font-size:11px;">BUS</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export function LiveMap({ buses, center = [6.5244, 3.3792], height = 360 }: { buses: BusMarker[]; center?: [number, number]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true }).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [center]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const seen = new Set<string>();
    buses.forEach((b) => {
      if (typeof b.lat !== "number" || typeof b.lng !== "number") return;
      seen.add(b.id);
      if (markersRef.current[b.id]) {
        markersRef.current[b.id].setLatLng([b.lat, b.lng]);
      } else {
        markersRef.current[b.id] = L.marker([b.lat, b.lng], { icon }).addTo(map).bindPopup(`Bus ${b.bus_number}`);
      }
    });
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    });
  }, [buses]);

  return <div ref={ref} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden" }} />;
}
