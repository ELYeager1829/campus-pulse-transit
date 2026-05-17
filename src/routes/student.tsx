import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveMap } from "@/components/LiveMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeCanvas } from "qrcode.react";
import { Bus, Clock, MapPin, Users, Ticket, Bell, AlertTriangle, CheckCircle2, Loader2, ArrowRight, Hourglass, XCircle, MapPinOff, Navigation, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useGeolocation, haversineKm } from "@/hooks/use-geolocation";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/student")({ component: StudentPage });

// ── routes.json inlined ────────────────────────────────────────────────────
const ROUTES_DATA = {
  routes: [
    {
      routeName: "Soshanguve ↔ Main Campus",
      times: ["09:00", "11:00", "13:00", "14:00", "16:00", "17:00", "18:00", "19:30"],
      endTime: "19:30",
    },
    {
      routeName: "Soshanguve ↔ Arcadia",
      times: ["07:00", "09:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:30"],
      endTime: "19:30",
    },
    {
      routeName: "Soshanguve ↔ Harangua",
      times: ["09:00", "11:00", "13:00", "14:00", "16:00", "17:00", "18:00", "19:00"],
      endTime: "19:00",
    },
    {
      routeName: "Soshanguve ↔ Emalahleni",
      times: ["09:00", "11:00", "13:00", "14:00", "16:00", "17:00", "18:00", "19:30"],
      endTime: "19:30",
    },
  ],
};

// ── Types ──────────────────────────────────────────────────────────────────
interface Trip {
  id: string;
  bus_id: string;
  route_id: string;
  status: string;
  occupancy: number;
  capacity: number;
  eta_minutes: number;
  delay_minutes: number;
  departure_time?: string;
}
interface BusRow { id: string; bus_number: string; current_lat: number | null; current_lng: number | null; status: string; }
interface RouteRow { id: string; name: string; origin: string; destination: string; estimated_duration_min: number; }
interface Booking { id: string; trip_id: string; qr_code: string; status: string; created_at: string; }
interface Notification { id: string; title: string; body: string | null; kind: string; read: boolean; created_at: string; }

interface ScheduleSlot {
  key: string;
  routeName: string;
  time: string;
  etaMin: number;
  isPast: boolean;
  isLastBus: boolean;
}

function buildSlots(now: Date): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  for (const r of ROUTES_DATA.routes) {
    const lastTime = r.times[r.times.length - 1];
    for (const t of r.times) {
      const [h, m] = t.split(":").map(Number);
      const dep = new Date(now); dep.setHours(h, m, 0, 0);
      const diffMin = Math.round((dep.getTime() - now.getTime()) / 60000);
      slots.push({ key: `${r.routeName}-${t}`, routeName: r.routeName, time: t, etaMin: diffMin, isPast: diffMin < -5, isLastBus: t === lastTime });
    }
  }
  return slots;
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const g: Record<string, T[]> = {};
  for (const item of arr) { const k = key(item); if (!g[k]) g[k] = []; g[k].push(item); }
  return g;
}

// ── Component ──────────────────────────────────────────────────────────────
function StudentPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confirmTrip, setConfirmTrip] = useState<Trip | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<ScheduleSlot | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [browseRoute, setBrowseRoute] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const alertedRef = useRef<Record<string, Set<number>>>({});

  // Request student geolocation for ETA accuracy
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => console.debug("[student-geo]", pos.coords.latitude, pos.coords.longitude),
      (err) => console.warn("geo", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Traffic delay alerts at 15/10/5 min thresholds for the user's active trip
  useEffect(() => {
    if (!myActiveBooking) return;
    const trip = trips.find(t => t.id === myActiveBooking.trip_id);
    if (!trip || trip.delay_minutes <= 0) return;
    if (!alertedRef.current[trip.id]) alertedRef.current[trip.id] = new Set();
    for (const th of [15, 10, 5]) {
      if (trip.eta_minutes <= th && !alertedRef.current[trip.id].has(th)) {
        alertedRef.current[trip.id].add(th);
        toast.warning(`Delay alert · ${th} min ETA`, { description: `Your bus is ${trip.eta_minutes}m away (+${trip.delay_minutes}m delay).`, duration: 8000 });
      }
    }
  }, [trips, myActiveBooking]);

  // Data load
  async function loadAllData() {
    if (!user) return;
    const [tripsRes, busesRes, routesRes, notifsRes, bookingsRes] = await Promise.all([
      supabase.from("trips").select("*").in("status", ["active", "scheduled", "full", "delayed"]).order("created_at", { ascending: false }),
      supabase.from("buses").select("*"),
      supabase.from("routes").select("*"),
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
      supabase.from("bookings").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setTrips((tripsRes.data ?? []) as Trip[]);
    setBuses((busesRes.data ?? []) as BusRow[]);
    setRoutes((routesRes.data ?? []) as RouteRow[]);
    setNotifications((notifsRes.data ?? []) as Notification[]);
    setBookings((bookingsRes.data ?? []) as Booking[]);
  }

  useEffect(() => {
    if (!user) return;
    loadAllData();
    const ch = supabase.channel("student-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadAllData)
      .on("postgres_changes", { event: "*", schema: "public", table: "buses" }, loadAllData)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, loadAllData)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, loadAllData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const route = (id: string) => routes.find(r => r.id === id);
  const bus = (id: string) => buses.find(b => b.id === id);
  const activeBuses = buses.filter(b => b.current_lat && b.current_lng).map(b => ({ id: b.id, bus_number: b.bus_number, lat: b.current_lat!, lng: b.current_lng! }));
  const myActive = useMemo(() => bookings.find(b => b.status === "booked"), [bookings]);
  const myTrip = myActive ? trips.find(t => t.id === myActive.trip_id) : undefined;
  const justBooked = bookingId ? bookings.find(b => b.id === bookingId) : null;
  const justBookedTrip = justBooked ? trips.find(t => t.id === justBooked.trip_id) : null;

  async function confirmBooking() {
    if (!user || !confirmTrip) return;
    setSubmitting(true);
    try {
      const { data: latest } = await supabase.from("trips").select("*").eq("id", confirmTrip.id).single();
      if (!latest) { toast.error("Trip no longer available"); return; }
      if (myActiveBooking) { toast.error("You already have an active booking"); return; }
      if (latest.occupancy >= latest.capacity) {
        const { error } = await supabase.from("waiting_queue").insert({ trip_id: confirmTrip.id, user_id: user.id });
        if (error) toast.error(error.message); else toast.success("Bus full — added to queue");
        setConfirmTrip(null); return;
      }
      const { data: created, error } = await supabase.from("bookings").insert({ trip_id: confirmTrip.id, user_id: user.id }).select().single();
      if (error) { toast.error(error.message); return; }
      setBookings(prev => [created, ...prev]);
      setTrips(prev => prev.map(t => t.id === confirmTrip.id ? { ...t, occupancy: t.occupancy + 1 } : t));
      setBookingId(created.id);
      setConfirmTrip(null);
      toast.success("Seat booked!");
    } finally { setSubmitting(false); }
  }

  // Book schedule slot
  async function confirmSlotBooking() {
    if (!user || !confirmSlot) return;
    if (myActiveBooking) { toast.error("You already have an active booking"); return; }
    setSubmitting(true);
    const matchedTrip = trips.find(t => getRoute(t.route_id)?.name === confirmSlot.routeName && t.status !== "full");
    if (matchedTrip) {
      const { data: created, error } = await supabase.from("bookings").insert({ trip_id: matchedTrip.id, user_id: user.id }).select().single();
      if (error) { toast.error(error.message); setSubmitting(false); return; }
      setBookings(prev => [created, ...prev]);
      setTrips(prev => prev.map(t => t.id === matchedTrip.id ? { ...t, occupancy: t.occupancy + 1 } : t));
      setBookingId(created.id);
      toast.success("Seat booked!");
    } else {
      await new Promise(r => setTimeout(r, 500));
      toast.success(`Reserved on ${confirmSlot.routeName} at ${confirmSlot.time}`);
    }
    setSubmitting(false);
    setConfirmSlot(null);
  }

  // Cancel booking
  async function cancelBooking() {
    if (!user || !myActiveBooking) return;
    setCancelling(true);
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", myActiveBooking.id);
    setCancelling(false);
    if (error) { toast.error(error.message); return; }
    setBookings(prev => prev.map(b => b.id === myActiveBooking.id ? { ...b, status: "cancelled" } : b));
    toast.success("Booking cancelled");
    setCancelOpen(false);
  }

  // End trip
  async function endTrip() {
    if (!user || !myActiveBooking || !myActiveTrip) return;
    setEndingTrip(true);
    const { error } = await supabase.from("bookings").update({ status: "completed" }).eq("id", myActiveBooking.id);
    if (!error) {
      await supabase.from("trips").update({ status: "completed" }).eq("id", myActiveTrip.id);
      setBookings(prev => prev.map(b => b.id === myActiveBooking.id ? { ...b, status: "completed" } : b));
      toast.success("Trip ended. Thanks for riding!");
    } else { toast.error(error.message); }
    setEndingTrip(false);
  }

  async function joinQueue(trip: Trip) {
    if (!user) return;
    const { error } = await supabase.from("waiting_queue").insert({ trip_id: trip.id, user_id: user.id });
    if (error) toast.error(error.message); else toast.success("Added to waiting queue");
  }

  const browseSlots = browseRoute ? (groupedSlots[browseRoute] ?? []) : [];

  return (
    <DashboardShell requireRole="student">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Student dashboard</h1>
        <p className="text-muted-foreground">Browse routes, book your seat, board with QR.</p>
      </div>

      {(geo.status === "denied" || geo.status === "unsupported" || geo.status === "error") && (
        <Reveal className="mb-6">
          <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Location access is off</p>
              <p className="mt-0.5 text-muted-foreground">
                {geo.status === "unsupported"
                  ? "This browser doesn't support GPS — distance and proximity alerts are unavailable."
                  : "Enable GPS so we can show your live distance to the bus and proximity alerts."}
                {geo.coords && (
                  <> Showing your <span className="font-medium text-foreground">last known location</span> from {new Date(geo.coords.ts).toLocaleTimeString()}.</>
                )}
              </p>
              {myTrip && (
                <p className="mt-1 text-xs text-muted-foreground">Last reported ETA: <span className="font-semibold text-foreground">{myTrip.eta_minutes} min</span>{myTrip.delay_minutes>0 && ` (+${myTrip.delay_minutes}m delay)`}</p>
              )}
            </div>
            {geo.status !== "unsupported" && (
              <Button size="sm" onClick={geo.retry} className="bg-warning text-warning-foreground hover:bg-warning/90">
                <Navigation className="mr-2 h-4 w-4"/>Enable GPS
              </Button>
            )}
          </div>
        </Reveal>
      )}

      <div className="grid gap-6 lg:grid-cols-3">

        {/* LEFT */}
        <div className="lg:col-span-2 space-y-6">
          <Card id="map" className="overflow-hidden shadow-soft scroll-mt-20">
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" />Live map</CardTitle><Badge variant="secondary">{activeBuses.length} buses live</Badge></CardHeader>
            <CardContent className="p-0"><LiveMap buses={activeBuses} /></CardContent>
          </Card>
          </Reveal>

          <Card id="routes" className="shadow-soft scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-accent" />All routes &amp; schedules
              </CardTitle>
              {myActiveBooking && <p className="text-xs text-muted-foreground">You have an active booking — ticket is on the right.</p>}
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(groupedSlots).map(([routeName, slots]) => {
                const upcoming = slots.filter(s => !s.isPast);
                const next = upcoming[0];
                return (
                  <div key={routeName} className="rounded-2xl border bg-card p-4 shadow-soft">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold">{routeName}</h3>
                        <p className="text-xs text-muted-foreground">{upcoming.length} departure{upcoming.length !== 1 ? "s" : ""} remaining today</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setBrowseRoute(routeName)}>All times</Button>
                    </div>

                    {next ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-gradient text-accent-foreground">
                            <Bus className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Next departure</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />{next.time}
                              {next.isLastBus && <Badge variant="outline" className="ml-1 text-[10px] border-warning text-warning">Last bus</Badge>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-display text-xl font-bold">{next.etaMin}m</p>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">away</p>
                          </div>
                          <Button size="sm" className="bg-primary" disabled={!!myActiveBooking} onClick={() => setConfirmSlot(next)}>
                            <Ticket className="mr-1.5 h-3.5 w-3.5" />Book
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">No more departures today.</p>
                    )}

                    {upcoming.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {upcoming.slice(1, 4).map(s => (
                          <button
                            key={s.key}
                            disabled={!!myActiveBooking}
                            onClick={() => setConfirmSlot(s)}
                            className="rounded-lg border bg-secondary px-3 py-1.5 text-xs font-medium transition hover:bg-accent/10 hover:border-accent disabled:opacity-40"
                          >
                            {s.time}{s.isLastBus ? " · last" : ""}
                          </button>
                        ))}
                        {upcoming.length > 4 && (
                          <button onClick={() => setBrowseRoute(routeName)} className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                            +{upcoming.length - 4} more
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {myActive && myTrip ? (
            <Card id="ticket" className="overflow-hidden border-accent/40 shadow-glow scroll-mt-20">
              <CardHeader className="bg-amber-gradient text-accent-foreground">
                <CardTitle className="flex items-center justify-between">
                  <span>Your boarding pass</span>
                  <Badge variant="secondary" className="bg-white/90 text-foreground">Active</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid place-items-center gap-3 p-6">
                <div className="rounded-2xl bg-white p-4 shadow-soft"><QRCodeCanvas value={myActiveBooking.qr_code} size={170} /></div>
                <div className="text-center">
                  <p className="font-display text-lg font-bold">{bus(myTrip.bus_id)?.bus_number} · {route(myTrip.route_id)?.name}</p>
                  <p className="text-xs text-muted-foreground">{route(myTrip.route_id)?.origin} → {route(myTrip.route_id)?.destination}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Show this QR to the marshal at boarding.</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTicketOpen(true)}>View ticket</Button>
                  <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90" disabled={endingTrip} onClick={endTrip}>
                    {endingTrip ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ending…</> : <><CheckCircle2 className="mr-2 h-4 w-4" />End trip</>}
                  </Button>
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => setCancelOpen(true)} disabled={cancelling}>
                  {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : <><XCircle className="mr-2 h-4 w-4" />Cancel booking</>}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card id="ticket" className="shadow-soft scroll-mt-20">
              <CardHeader><CardTitle>No active booking</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Pick a route or time slot on the left. Your QR ticket appears here after booking.</p></CardContent>
            </Card>
          )}
          </Reveal>

          <Reveal delay={0.15}>
          <Card id="notifications" className="shadow-soft scroll-mt-20">
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-accent" />Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {notifications.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
              {notifications.map(n => (
                <div key={n.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <Badge variant="outline" className="text-[10px]">{n.kind}</Badge>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
          </Reveal>

          <Reveal delay={0.2}><ReportIssueCard /></Reveal>
        </div>
      </div>

      {/* Browse all times for a route */}
      <Dialog open={!!browseRoute} onOpenChange={o => !o && setBrowseRoute(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{browseRoute}</DialogTitle>
            <DialogDescription>All scheduled departures today. Tap a time to book.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {browseSlots.map(s => (
              <div key={s.key} className={`flex items-center justify-between rounded-xl border p-3 ${s.isPast ? "opacity-40" : ""}`}>
                <div>
                  <p className="font-semibold">{s.time}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.isPast ? "Departed" : `in ${s.etaMin} min`}
                    {s.isLastBus && !s.isPast && <span className="ml-2 text-warning font-medium">· Last bus</span>}
                  </p>
                </div>
                <Button size="sm" className="bg-primary" disabled={s.isPast || !!myActiveBooking} onClick={() => { setBrowseRoute(null); setConfirmSlot(s); }}>
                  Book
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBrowseRoute(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm live trip */}
      <Dialog open={!!confirmTrip} onOpenChange={o => !o && setConfirmTrip(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm your seat</DialogTitle><DialogDescription>Review details before booking.</DialogDescription></DialogHeader>
          {confirmTrip && (() => {
            const r = getRoute(confirmTrip.route_id); const b = getBus(confirmTrip.bus_id);
            return (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
                <Row label="Route" value={r?.name} />
                <Row label="From → To" value={`${r?.origin} → ${r?.destination}`} />
                <Row label="Bus" value={b?.bus_number} mono />
                <Row label="ETA" value={`${confirmTrip.eta_minutes}m${confirmTrip.delay_minutes > 0 ? ` (+${confirmTrip.delay_minutes}m delay)` : ""}`} />
                <Row label="Seats left" value={`${Math.max(0, confirmTrip.capacity - confirmTrip.occupancy)}/${confirmTrip.capacity}`} />
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTrip(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={confirmBooking} disabled={submitting} className="bg-primary">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking…</> : <><Ticket className="mr-2 h-4 w-4" />Confirm</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm schedule slot */}
      <Dialog open={!!confirmSlot} onOpenChange={o => !o && setConfirmSlot(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Book seat</DialogTitle><DialogDescription>Confirm your scheduled departure.</DialogDescription></DialogHeader>
          {confirmSlot && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
              <Row label="Route" value={confirmSlot.routeName} />
              <Row label="Departure" value={confirmSlot.time} />
              <Row label="In" value={`${confirmSlot.etaMin} min`} />
              {confirmSlot.isLastBus && <p className="text-xs font-semibold text-warning">⚠ This is the last bus on this route today.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSlot(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={confirmSlotBooking} disabled={submitting} className="bg-primary">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking…</> : <><Ticket className="mr-2 h-4 w-4" />Confirm</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking success */}
      <Dialog open={!!justBooked} onOpenChange={o => !o && setBookingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-success" />Booking confirmed</DialogTitle>
            <DialogDescription>Show this QR to the marshal to board.</DialogDescription>
          </DialogHeader>
          {justBooked && justBookedTrip && (
            <div className="grid place-items-center gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-soft"><QRCodeCanvas value={justBooked.qr_code} size={180} /></div>
              <div className="w-full space-y-1 rounded-xl border bg-muted/30 p-4 text-sm">
                <Row label="Route" value={getRoute(justBookedTrip.route_id)?.name} />
                <Row label="Bus" value={getBus(justBookedTrip.bus_id)?.bus_number} mono />
                <Row label="ETA" value={`${justBookedTrip.eta_minutes}m`} />
                <Row label="Ticket ID" value={`${justBooked.qr_code.slice(0, 12)}…`} mono />
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => setBookingId(null)} className="bg-primary w-full">Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full ticket */}
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Your ticket</DialogTitle></DialogHeader>
          {myActiveBooking && myActiveTrip && (
            <div className="grid place-items-center gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-soft"><QRCodeCanvas value={myActiveBooking.qr_code} size={220} /></div>
              <div className="w-full space-y-1 rounded-xl border bg-muted/30 p-4 text-sm">
                <Row label="Route" value={getRoute(myActiveTrip.route_id)?.name} />
                <Row label="From → To" value={`${getRoute(myActiveTrip.route_id)?.origin} → ${getRoute(myActiveTrip.route_id)?.destination}`} />
                <Row label="Bus" value={getBus(myActiveTrip.bus_id)?.bus_number} mono />
                <Row label="ETA" value={`${myActiveTrip.eta_minutes}m`} />
                <Row label="Booked" value={new Date(myActiveBooking.created_at).toLocaleString()} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" />Cancel booking?</DialogTitle>
            <DialogDescription>Your seat will be released. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>Keep booking</Button>
            <Button variant="destructive" onClick={cancelBooking} disabled={cancelling}>
              {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : <><XCircle className="mr-2 h-4 w-4" />Cancel booking</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono font-semibold" : "font-semibold"}>{value ?? "—"}</span>
    </div>
  );
}

function ReportIssueCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  async function submitIssue() {
    if (!user || !description.trim()) return;
    const { error } = await supabase.from("issues").insert({ reporter_id: user.id, description: description.trim(), kind: "student_report" });
    if (error) toast.error(error.message);
    else { toast.success("Issue reported"); setOpen(false); setDescription(""); }
  }
  return (
    <Card id="report" className="shadow-soft scroll-mt-20">
      <CardHeader><CardTitle>Need help?</CardTitle></CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="outline" className="w-full">Report an issue</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Report an issue</DialogTitle></DialogHeader>
            <Textarea placeholder="Describe the issue…" value={description} onChange={e => setDescription(e.target.value)} />
            <Button onClick={submitIssue} className="bg-primary">Submit</Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}