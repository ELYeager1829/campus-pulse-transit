import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from "@vis.gl/react-google-maps";
import { useState } from "react";

interface BusMarker { id: string; bus_number: string; lat: number; lng: number }

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  "AIzaSyC3ytcUsyXEd9xf1cQHUV-T7ldgEotGC6c";

export function LiveMap({
  buses,
  center = { lat: 6.5244, lng: 3.3792 },
  height = 360,
}: {
  buses: BusMarker[];
  center?: { lat: number; lng: number } | [number, number];
  height?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const c = Array.isArray(center) ? { lat: center[0], lng: center[1] } : center;
  const focus = buses[0] ? { lat: buses[0].lat, lng: buses[0].lng } : c;

  return (
    <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#eef" }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          mapId="campusbus-live"
          defaultCenter={focus}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          {buses.map((b) => (
            <AdvancedMarker
              key={b.id}
              position={{ lat: b.lat, lng: b.lng }}
              onClick={() => setActive(b.id)}
            >
              <Pin background="#f0a830" borderColor="#1a1f3a" glyphColor="#1a1f3a" />
            </AdvancedMarker>
          ))}
          {active && buses.find((b) => b.id === active) && (
            <InfoWindow
              position={{
                lat: buses.find((b) => b.id === active)!.lat,
                lng: buses.find((b) => b.id === active)!.lng,
              }}
              onCloseClick={() => setActive(null)}
            >
              <div style={{ fontWeight: 600 }}>
                Bus {buses.find((b) => b.id === active)!.bus_number}
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
