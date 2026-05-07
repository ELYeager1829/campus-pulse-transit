import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface BusMarker { id: string; bus_number: string; lat: number; lng: number }

export function LiveMap({ buses, center = [6.5244, 3.3792], height = 360 }: { buses: BusMarker[]; center?: [number, number]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      LRef.current = L;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:linear-gradient(135deg,#f0a830,#f6c560);width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#1a1f3a;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,.25);font-weight:700;font-size:11px;">BUS</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      (LRef.current as any)._busIcon = icon;
      const map = L.map(ref.current).setView(center, 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
      mapRef.current = map;
      renderMarkers();
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { renderMarkers(); }, [buses]);

  function renderMarkers() {
    const map = mapRef.current; const L = LRef.current; if (!map || !L) return;
    const seen = new Set<string>();
    buses.forEach((b) => {
      if (typeof b.lat !== "number" || typeof b.lng !== "number") return;
      seen.add(b.id);
      if (markersRef.current[b.id]) markersRef.current[b.id].setLatLng([b.lat, b.lng]);
      else markersRef.current[b.id] = L.marker([b.lat, b.lng], { icon: L._busIcon }).addTo(map).bindPopup(`Bus ${b.bus_number}`);
    });
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    });
  }

  return <div ref={ref} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#eef" }} />;
}
