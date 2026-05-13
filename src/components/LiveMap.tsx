/// <reference types="google.maps" />
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";

interface BusMarker { id: string; bus_number: string; lat: number; lng: number }

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  "AIzaSyC3ytcUsyXEd9xf1cQHUV-T7ldgEotGC6c";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function TrackingLine({ from, to }: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const line = new google.maps.Polyline({
      path: [from, to],
      geodesic: true,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.9,
      strokeWeight: 4,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }],
      map,
    });
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(from); bounds.extend(to);
    map.fitBounds(bounds, 80);
    return () => line.setMap(null);
  }, [map, from.lat, from.lng, to.lat, to.lng]);
  return null;
}

export function LiveMap({
  buses,
  center = { lat: -25.5350, lng: 28.1018 },
  height,
  trackBusId,
  userLoc: externalUserLoc,
}: {
  buses: BusMarker[];
  center?: { lat: number; lng: number } | [number, number];
  height?: number;
  trackBusId?: string | null;
  userLoc?: { lat: number; lng: number } | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [internalUserLoc, setInternalUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const c = Array.isArray(center) ? { lat: center[0], lng: center[1] } : center;

  useEffect(() => {
    if (externalUserLoc !== undefined) return; // parent controls location
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setInternalUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("geolocation", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [externalUserLoc]);

  const userLoc = externalUserLoc !== undefined ? externalUserLoc : internalUserLoc;
  const trackedBus = trackBusId ? buses.find(b => b.id === trackBusId) : null;
  const focus = userLoc ?? (buses[0] ? { lat: buses[0].lat, lng: buses[0].lng } : c);
  const distanceKm = userLoc && trackedBus ? haversineKm(userLoc, { lat: trackedBus.lat, lng: trackedBus.lng }) : null;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-secondary" style={{ height: height ?? "clamp(220px, 45vh, 480px)" }}>
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
            <AdvancedMarker key={b.id} position={{ lat: b.lat, lng: b.lng }} onClick={() => setActive(b.id)}>
              <Pin
                background={b.id === trackBusId ? "#22c55e" : "#f0a830"}
                borderColor="#1a1f3a"
                glyphColor="#1a1f3a"
              />
            </AdvancedMarker>
          ))}
          {userLoc && trackedBus && (
            <TrackingLine from={userLoc} to={{ lat: trackedBus.lat, lng: trackedBus.lng }} />
          )}
          {active && buses.find((b) => b.id === active) && (
            <InfoWindow
              position={{ lat: buses.find((b) => b.id === active)!.lat, lng: buses.find((b) => b.id === active)!.lng }}
              onCloseClick={() => setActive(null)}
            >
              <div style={{ fontWeight: 600 }}>Bus {buses.find((b) => b.id === active)!.bus_number}</div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
      {distanceKm !== null && trackedBus && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-card/95 px-3 py-2 text-xs font-medium shadow-soft backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            <span>Bus {trackedBus.bus_number}</span>
          </div>
          <div className="mt-0.5 font-display text-base font-bold">
            {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(2)} km`}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            ~{Math.max(1, Math.round((distanceKm / 30) * 60))} min away
          </div>
        </div>
      )}
    </div>
  );
}
