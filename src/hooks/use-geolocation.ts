import { useEffect, useState } from "react";

export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unsupported" | "error";
export interface GeoCoords { lat: number; lng: number; ts: number }

const STORAGE_KEY = "campusbus.lastGeo";

function loadLast(): GeoCoords | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as GeoCoords) : null;
  } catch { return null; }
}

export function useGeolocation() {
  const [coords, setCoords] = useState<GeoCoords | null>(() => loadLast());
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    let watchId: number | null = null;

    const start = () => {
      setStatus("prompting");
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
          setCoords(c);
          setStatus("granted");
          setError(null);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* noop */ }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setStatus("denied");
          else setStatus("error");
          setError(err.message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    };

    // Use Permissions API to skip prompting if already denied
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((res) => {
        if (res.state === "denied") { setStatus("denied"); return; }
        start();
        res.onchange = () => {
          if (res.state === "denied") setStatus("denied");
          else if (res.state === "granted") start();
        };
      }).catch(() => start());
    } else {
      start();
    }

    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  const retry = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        setCoords(c); setStatus("granted"); setError(null);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* noop */ }
      },
      (err) => { setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"); setError(err.message); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return { coords, status, error, retry, isStale: coords ? Date.now() - coords.ts > 5 * 60_000 : false };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
