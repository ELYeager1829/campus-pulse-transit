import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";

interface BusMarker { id: string; bus_number: string; lat: number; lng: number }

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  "AIzaSyC3ytcUsyXEd9xf1cQHUV-T7ldgEotGC6c";

export function LiveMap({
  buses,
  center = { lat: -25.7327, lng: 28.1631 }, // TUT Pretoria Main Campus
  height,
}: {
  buses: BusMarker[];
  center?: { lat: number; lng: number } | [number, number];
  height?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const c = Array.isArray(center) ? { lat: center[0], lng: center[1] } : center;

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("geolocation", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const focus = userLoc ?? (buses[0] ? { lat: buses[0].lat, lng: buses[0].lng } : c);

  return (
    <div
      className="w-full overflow-hidden rounded-2xl bg-secondary"
      style={{ height: height ?? "clamp(220px, 45vh, 480px)" }}
    >
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          mapId="campusbus-live"
          defaultCenter={focus}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          {userLoc && (
            <AdvancedMarker position={userLoc} title="You are here">
              <Pin background="#3b82f6" borderColor="#1e3a8a" glyphColor="#fff" />
            </AdvancedMarker>
          )}
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
