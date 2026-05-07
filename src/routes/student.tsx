import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveMap } from "@/components/LiveMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeCanvas } from "qrcode.react";
import { Bus, Clock, MapPin, Users, Ticket, Bell, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/student")({ component: StudentPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; eta_minutes: number; delay_minutes: number; }
interface Bus { id: string; bus_number: string; current_lat: number | null; current_lng: number | null; status: string; }
interface RouteRow { id: string; name: string; origin: string; destination: string; }
interface Booking { id: string; trip_id: string; qr_code: string; status: string; created_at: string; }
interface Notif { id: string; title: string; body: string | null; kind: string; read: boolean; created_at: string; }

function StudentPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);

  useEffect(() => {
    const load = async () => {
      const [t, b, r, n] = await Promise.all([
        supabase.from("trips").select("*").in("status", ["active","scheduled","full","delayed"]).order("created_at", { ascending: false }),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
        user ? supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at",{ascending:false}).limit(8) : Promise.resolve({ data: [] as Notif[] }),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as Bus[]);
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

  const routeName = (id: string) => routes.find(r => r.id === id)?.name ?? "Route";
  const busNumber = (id: string) => buses.find(b => b.id === id)?.bus_number ?? "—";
  const activeBuses = buses.filter(b => b.current_lat && b.current_lng).map(b => ({ id: b.id, bus_number: b.bus_number, lat: b.current_lat!, lng: b.current_lng! }));
  const myActive = bookings.find(b => b.status === "booked");
  const myTrip = myActive ? trips.find(t => t.id === myActive.trip_id) : undefined;

  async function book(trip: Trip) {
    if (!user) return;
    if (trip.occupancy >= trip.capacity) {
      // join queue
      const { error } = await supabase.from("waiting_queue").insert({ trip_id: trip.id, user_id: user.id });
      if (error) toast.error(error.message); else toast.success("Joined waiting queue");
      return;
    }
    const { error } = await supabase.from("bookings").insert({ trip_id: trip.id, user_id: user.id });
    if (error) toast.error(error.message); else toast.success("Seat booked!");
  }

  return (
    <DashboardShell requireRole="student">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Student dashboard</h1>
        <p className="text-muted-foreground">Track buses live, book your seat, board with QR.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden shadow-soft">
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" />Live map</CardTitle><Badge variant="secondary">{activeBuses.length} buses</Badge></CardHeader>
            <CardContent className="p-0"><LiveMap buses={activeBuses} /></CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader><CardTitle className="flex items-center gap-2"><Bus className="h-5 w-5 text-accent" />Available trips</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {trips.length === 0 && <p className="text-sm text-muted-foreground">No trips right now.</p>}
              {trips.map(t => {
                const pct = Math.round((t.occupancy / t.capacity) * 100);
                const full = t.occupancy >= t.capacity;
                return (
                  <div key={t.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold">{busNumber(t.bus_id)}</span>
                          <Badge variant={full ? "destructive" : "secondary"}>{full ? "FULL" : t.status}</Badge>
                          {t.delay_minutes > 0 && <Badge variant="outline" className="border-warning text-warning"><AlertTriangle className="mr-1 h-3 w-3" />+{t.delay_minutes}m</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{routeName(t.route_id)}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 font-display text-xl font-bold"><Clock className="h-4 w-4 text-accent" />{t.eta_minutes}m</div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">ETA</p>
                      </div>
                    </div>
                    <div className="mt-3"><Progress value={pct} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span><Users className="mr-1 inline h-3 w-3" />{t.occupancy}/{t.capacity}</span><span>{pct}% occupied</span></div></div>
                    <div className="mt-3"><Button onClick={() => book(t)} className="w-full bg-primary" variant={full ? "outline" : "default"}>{full ? "Join waiting queue" : <><Ticket className="mr-2 h-4 w-4" />Book seat</>}</Button></div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {myActive && myTrip && (
            <Card className="overflow-hidden border-accent/40 shadow-glow">
              <CardHeader className="bg-amber-gradient text-accent-foreground"><CardTitle>Your boarding pass</CardTitle></CardHeader>
              <CardContent className="grid place-items-center gap-3 p-6">
                <div className="rounded-xl bg-white p-3"><QRCodeCanvas value={myActive.qr_code} size={160} /></div>
                <div className="text-center">
                  <p className="font-display text-lg font-bold">{busNumber(myTrip.bus_id)} · {routeName(myTrip.route_id)}</p>
                  <p className="text-sm text-muted-foreground">Show this QR to the marshal</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-soft">
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
    <Card className="shadow-soft">
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
