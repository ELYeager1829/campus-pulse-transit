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
import { Bus, Clock, MapPin, Users, Ticket, Bell, AlertTriangle, CheckCircle2, Loader2, ArrowRight, Hourglass, XCircle, MapPinOff, Navigation } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useGeolocation, haversineKm } from "@/hooks/use-geolocation";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/student")({ component: StudentPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; eta_minutes: number; delay_minutes: number; }
interface BusRow { id: string; bus_number: string; current_lat: number | null; current_lng: number | null; status: string; }
interface RouteRow { id: string; name: string; origin: string; destination: string; estimated_duration_min: number; }
interface Booking { id: string; trip_id: string; qr_code: string; status: string; created_at: string; }
interface Notif { id: string; title: string; body: string | null; kind: string; read: boolean; created_at: string; }

function StudentPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [confirmTrip, setConfirmTrip] = useState<Trip | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null); // id of just-booked record (for success modal)
  const [ticketOpen, setTicketOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const alertedRef = useRef<Record<string, Set<number>>>({});

  const geo = useGeolocation();
  const distAlertedRef = useRef<Set<string>>(new Set());

  // Traffic delay alerts at 15/10/5 min thresholds for the user's active trip
  useEffect(() => {
    const active = bookings.find(b => b.status === "booked");
    if (!active) return;
    const trip = trips.find(t => t.id === active.trip_id);
    if (!trip || trip.delay_minutes <= 0) return;
    const eta = trip.eta_minutes;
    const thresholds = [15, 10, 5];
    if (!alertedRef.current[trip.id]) alertedRef.current[trip.id] = new Set();
    for (const th of thresholds) {
      if (eta <= th && !alertedRef.current[trip.id].has(th)) {
        alertedRef.current[trip.id].add(th);
        toast.warning(`Traffic delay alert · ${th} min ETA`, {
          description: `Your bus is now ${eta} min away (+${trip.delay_minutes}m delay).`,
          duration: 8000,
        });
      }
    }
  }, [trips, bookings]);

  async function cancelBooking() {
    if (!user || !myActive) return;
    setCancelling(true);
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", myActive.id);
    setCancelling(false);
    if (error) toast.error(error.message);
    else { toast.success("Booking cancelled"); setCancelOpen(false); }
  }

  useEffect(() => {
    const load = async () => {
      const [t, b, r, n] = await Promise.all([
        supabase.from("trips").select("*").in("status", ["active","scheduled","full","delayed"]).order("created_at", { ascending: false }),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
        user ? supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at",{ascending:false}).limit(8) : Promise.resolve({ data: [] as Notif[] }),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as BusRow[]);
      setRoutes((r.data ?? []) as RouteRow[]);
      setNotifs((n.data ?? []) as Notif[]);
      if (user) {
        const { data: bk } = await supabase.from("bookings").select("*").eq("user_id", user.id).order("created_at",{ascending:false});
        setBookings((bk ?? []) as Booking[]);
      }
    };
    load();

    const ch = supabase.channel("student-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "buses" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
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
  const myBus = myTrip ? buses.find(b => b.id === myTrip.bus_id) : undefined;
  const liveDistanceKm = (geo.coords && myBus?.current_lat && myBus?.current_lng && myTrip?.status === "active")
    ? haversineKm(geo.coords, { lat: myBus.current_lat, lng: myBus.current_lng })
    : null;

  // Distance-based proximity alerts
  useEffect(() => {
    if (!myTrip || myTrip.status !== "active") return;
    const key = myTrip.id;
    if (liveDistanceKm !== null) {
      if (liveDistanceKm <= 0.5 && !distAlertedRef.current.has(key + ":500m")) {
        distAlertedRef.current.add(key + ":500m");
        toast.success("Bus within 500m", { description: "Head to your stop now.", duration: 9000 });
      }
      if (liveDistanceKm <= 1 && !distAlertedRef.current.has(key + ":1km")) {
        distAlertedRef.current.add(key + ":1km");
        toast("Bus within 1km", { description: "Get ready to board." });
      }
    }
    if (myTrip.eta_minutes <= 5 && !distAlertedRef.current.has(key + ":5min")) {
      distAlertedRef.current.add(key + ":5min");
      toast("Arriving in ~5 minutes", { description: "Make your way to the pickup point." });
    }
  }, [liveDistanceKm, myTrip]);

  async function confirmBooking() {
    if (!user || !confirmTrip) return;
    const trip = confirmTrip;
    setSubmitting(true);
    try {
      // re-fetch latest trip to validate seats
      const { data: latest } = await supabase.from("trips").select("*").eq("id", trip.id).single();
      if (!latest) { toast.error("Trip no longer available"); return; }
      if (myActive) { toast.error("You already have an active booking"); return; }
      if (latest.occupancy >= latest.capacity) {
        const { error } = await supabase.from("waiting_queue").insert({ trip_id: trip.id, user_id: user.id });
        if (error) toast.error(error.message); else toast.success("Bus full — added to waiting queue");
        setConfirmTrip(null);
        return;
      }
      const { data: created, error } = await supabase.from("bookings").insert({ trip_id: trip.id, user_id: user.id }).select().single();
      if (error) { toast.error(error.message); return; }
      setBookingId(created!.id);
      setConfirmTrip(null);
      toast.success("Seat booked successfully");
    } finally { setSubmitting(false); }
  }

  async function joinQueue(trip: Trip) {
    if (!user) return;
    const { error } = await supabase.from("waiting_queue").insert({ trip_id: trip.id, user_id: user.id });
    if (error) toast.error(error.message); else toast.success("Added to waiting queue");
  }

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
        <div className="lg:col-span-2 space-y-6">
          <Reveal>
          <Card id="map" className="overflow-hidden shadow-soft scroll-mt-20">
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" />Live map</CardTitle><Badge variant="secondary">{activeBuses.length} buses live</Badge></CardHeader>
            <CardContent className="p-0"><LiveMap buses={activeBuses} trackBusId={myTrip?.status === "active" ? myTrip.bus_id : null} userLoc={geo.coords ? { lat: geo.coords.lat, lng: geo.coords.lng } : null} /></CardContent>
          </Card>
          </Reveal>

          <Reveal delay={0.05}>
          <Card id="routes" className="shadow-soft scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bus className="h-5 w-5 text-accent" />Available routes</CardTitle>
              {myActive && <p className="text-xs text-muted-foreground">You already have an active booking — view your ticket on the right.</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              {trips.length === 0 && <p className="text-sm text-muted-foreground">No trips scheduled right now.</p>}
              {trips.map(t => {
                const r = route(t.route_id);
                const b = bus(t.bus_id);
                const remaining = Math.max(0, t.capacity - t.occupancy);
                const pct = Math.round((t.occupancy / t.capacity) * 100);
                const full = remaining === 0;
                const delayed = t.delay_minutes > 0;
                const disabled = !!myActive;
                return (
                  <div key={t.id} className="group rounded-2xl border bg-card p-4 transition hover:shadow-soft">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-display text-lg font-bold">{r?.name ?? "Route"}</span>
                          <Badge variant="outline" className="font-mono">{b?.bus_number ?? "—"}</Badge>
                          {full ? <Badge variant="destructive">Bus Full</Badge> : <Badge variant="secondary" className="capitalize">{t.status}</Badge>}
                          {delayed && <Badge variant="outline" className="border-warning text-warning"><AlertTriangle className="mr-1 h-3 w-3" />Delayed +{t.delay_minutes}m</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{r?.origin ?? "—"}</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                          <span className="font-medium text-foreground">{r?.destination ?? "—"}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 font-display text-2xl font-bold"><Clock className="h-5 w-5 text-accent" />{t.eta_minutes}m</div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">ETA</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Progress value={pct} />
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{t.occupancy}/{t.capacity} seats</span>
                        <span className={full ? "font-semibold text-destructive" : "font-semibold text-foreground"}>{full ? "0 seats left" : `${remaining} seats left`}</span>
                      </div>
                    </div>

                    <div className="mt-4">
                      {full ? (
                        <Button onClick={() => joinQueue(t)} disabled={disabled} variant="outline" className="w-full">
                          <Hourglass className="mr-2 h-4 w-4" />Join waiting queue
                        </Button>
                      ) : (
                        <Button onClick={() => setConfirmTrip(t)} disabled={disabled} className="w-full bg-primary">
                          <Ticket className="mr-2 h-4 w-4" />Book seat
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          </Reveal>
        </div>

        <div className="space-y-6">
          <Reveal delay={0.1}>
          {myActive && myTrip ? (
            <Card id="ticket" className="overflow-hidden border-accent/40 shadow-glow scroll-mt-20">
              <CardHeader className="bg-amber-gradient text-accent-foreground">
                <CardTitle className="flex items-center justify-between">
                  <span>Your boarding pass</span>
                  <Badge variant="secondary" className="bg-white/90 text-foreground">Active</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid place-items-center gap-3 p-6">
                <div className="rounded-2xl bg-white p-4 shadow-soft"><QRCodeCanvas value={myActive.qr_code} size={170} /></div>
                <div className="text-center">
                  <p className="font-display text-lg font-bold">{bus(myTrip.bus_id)?.bus_number} · {route(myTrip.route_id)?.name}</p>
                  <p className="text-xs text-muted-foreground">{route(myTrip.route_id)?.origin} → {route(myTrip.route_id)?.destination}</p>
                  {liveDistanceKm !== null && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success"/>
                      {liveDistanceKm < 1 ? `${Math.round(liveDistanceKm * 1000)} m away` : `${liveDistanceKm.toFixed(2)} km away`}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Show this QR to the marshal at boarding.</p>
                </div>
                <div className="flex w-full gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setTicketOpen(true)}>View full ticket</Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => setCancelOpen(true)} disabled={cancelling}>
                    {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Cancelling…</> : <><XCircle className="mr-2 h-4 w-4"/>Cancel booking</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card id="ticket" className="shadow-soft scroll-mt-20">
              <CardHeader><CardTitle>No active booking</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Pick a route on the left to book a seat. Your QR ticket appears here after a successful booking.</p></CardContent>
            </Card>
          )}
          </Reveal>

          <Card id="notifications" className="shadow-soft scroll-mt-20">
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-accent" />Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {notifs.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
              {notifs.map(n => (
                <div key={n.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between"><p className="text-sm font-semibold">{n.title}</p><Badge variant="outline" className="text-[10px]">{n.kind}</Badge></div>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <ReportIssueCard />
        </div>
      </div>

      {/* Confirm booking dialog */}
      <Dialog open={!!confirmTrip} onOpenChange={(o) => !o && setConfirmTrip(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your seat</DialogTitle>
            <DialogDescription>Review the trip details before booking. A QR ticket is generated only after a successful booking.</DialogDescription>
          </DialogHeader>
          {confirmTrip && (() => {
            const r = route(confirmTrip.route_id); const b = bus(confirmTrip.bus_id);
            const remaining = Math.max(0, confirmTrip.capacity - confirmTrip.occupancy);
            return (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="font-semibold">{r?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">From → To</span><span className="font-semibold">{r?.origin} → {r?.destination}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bus</span><span className="font-mono font-semibold">{b?.bus_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ETA</span><span className="font-semibold">{confirmTrip.eta_minutes} min{confirmTrip.delay_minutes > 0 ? ` (+${confirmTrip.delay_minutes}m delay)` : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Seats left</span><span className="font-semibold">{remaining}/{confirmTrip.capacity}</span></div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTrip(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={confirmBooking} disabled={submitting} className="bg-primary">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking…</> : <><Ticket className="mr-2 h-4 w-4" />Confirm booking</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success modal */}
      <Dialog open={!!justBooked} onOpenChange={(o) => !o && setBookingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-success" />Booking confirmed</DialogTitle>
            <DialogDescription>Your seat is reserved. Show this QR code to the marshal to board.</DialogDescription>
          </DialogHeader>
          {justBooked && justBookedTrip && (
            <div className="grid place-items-center gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-soft"><QRCodeCanvas value={justBooked.qr_code} size={180} /></div>
              <div className="w-full space-y-1 rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="font-semibold">{route(justBookedTrip.route_id)?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bus</span><span className="font-mono font-semibold">{bus(justBookedTrip.bus_id)?.bus_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ETA</span><span className="font-semibold">{justBookedTrip.eta_minutes}m</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ticket ID</span><span className="font-mono text-xs">{justBooked.qr_code.slice(0, 12)}…</span></div>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => setBookingId(null)} className="bg-primary w-full">Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full ticket view */}
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Your ticket</DialogTitle></DialogHeader>
          {myActive && myTrip && (
            <div className="grid place-items-center gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-soft"><QRCodeCanvas value={myActive.qr_code} size={220} /></div>
              <div className="w-full space-y-1 rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="font-semibold">{route(myTrip.route_id)?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">From → To</span><span className="font-semibold">{route(myTrip.route_id)?.origin} → {route(myTrip.route_id)?.destination}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bus</span><span className="font-mono font-semibold">{bus(myTrip.bus_id)?.bus_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ETA</span><span className="font-semibold">{myTrip.eta_minutes}m</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Booked</span><span className="font-semibold">{new Date(myActive.created_at).toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel booking confirmation */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive"/>Cancel booking?</DialogTitle>
            <DialogDescription>Your seat will be released back to other students. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>Keep booking</Button>
            <Button variant="destructive" onClick={cancelBooking} disabled={cancelling}>
              {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Cancelling…</> : <><XCircle className="mr-2 h-4 w-4"/>Cancel booking</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function ReportIssueCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  async function submit() {
    if (!user || !desc.trim()) return;
    const { error } = await supabase.from("issues").insert({ reporter_id: user.id, description: desc, kind: "student_report" });
    if (error) toast.error(error.message); else { toast.success("Issue reported"); setOpen(false); setDesc(""); }
  }
  return (
    <Card id="report" className="shadow-soft scroll-mt-20">
      <CardHeader><CardTitle>Need help?</CardTitle></CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="outline" className="w-full">Report an issue</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Report an issue</DialogTitle></DialogHeader>
            <Textarea placeholder="Describe the issue…" value={desc} onChange={e=>setDesc(e.target.value)} />
            <Button onClick={submit} className="bg-primary">Submit</Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
