import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Bus, Play, Square, MapPin, AlertTriangle, Wrench, FileWarning, Clock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/driver")({ component: DriverPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; driver_id: string | null; }
interface BusRow { id: string; bus_number: string; driver_id: string | null; }
interface RouteRow { id: string; name: string; }
interface Issue { id: string; bus_id: string | null; trip_id: string | null; kind: string; severity: string; description: string; status: string; created_at: string; }

function DriverPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [tracking, setTracking] = useState<number | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [t, b, r, i] = await Promise.all([
        supabase.from("trips").select("*").or(`driver_id.eq.${user?.id ?? ""},driver_id.is.null`).order("created_at",{ascending:false}),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
        supabase.from("issues").select("*").eq("reporter_id", user?.id ?? "").order("created_at",{ascending:false}).limit(20),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as BusRow[]);
      setRoutes((r.data ?? []) as RouteRow[]);
      setIssues((i.data ?? []) as Issue[]);
    };
    if (user) load();
    const ch = supabase.channel("driver-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"trips"}, load)
      .on("postgres_changes",{event:"*",schema:"public",table:"issues"}, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const busNumber = (id: string | null) => buses.find(b=>b.id===id)?.bus_number ?? "—";
  const routeName = (id: string) => routes.find(r=>r.id===id)?.name ?? "Route";
  const myActive = trips.find(t => t.driver_id === user?.id && t.status === "active");
  const myBuses = buses.filter(b => b.driver_id === user?.id);

  async function startTrip(t: Trip) {
    if (!user) return;
    setStartingId(t.id);
    const { error } = await supabase.from("trips").update({ driver_id: user.id, status: "active", started_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setStartingId(null); toast.error(error.message); return; }
    await supabase.from("buses").update({ driver_id: user.id, status: "active" }).eq("id", t.bus_id);
    toast.success("Trip started");
    startGps(t);
    setStartingId(null);
  }

  async function endTrip(t: Trip) {
    await supabase.from("trips").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", t.id);
    await supabase.from("buses").update({ status: "idle" }).eq("id", t.bus_id);
    stopGps();
    toast.success("Trip completed");
  }

  function startGps(t: Trip) {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    const id = navigator.geolocation.watchPosition(async (pos) => {
      await supabase.from("buses").update({ current_lat: pos.coords.latitude, current_lng: pos.coords.longitude, updated_at: new Date().toISOString() }).eq("id", t.bus_id);
    }, (err) => toast.error("GPS: " + err.message), { enableHighAccuracy: true, maximumAge: 5000 });
    setTracking(id);
  }
  function stopGps() {
    if (tracking !== null) { navigator.geolocation.clearWatch(tracking); setTracking(null); }
  }
  useEffect(() => () => stopGps(), []); // cleanup

  const candidateBuses = myBuses.length ? myBuses : buses;

  return (
    <DashboardShell requireRole="driver">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Driver</h1>
          <p className="text-muted-foreground">Manage your trips, share live location, and report issues.</p>
        </div>
        <ReportIssue
          buses={candidateBuses}
          defaultBusId={myActive?.bus_id ?? candidateBuses[0]?.id ?? null}
          tripId={myActive?.id ?? null}
        />
      </div>

      {myActive && (
        <Card id="active-trip" className="mb-6 border-success/50 shadow-soft scroll-mt-20">
          <CardHeader><CardTitle className="flex items-center gap-2 text-success"><MapPin className="h-5 w-5" />On a trip · {busNumber(myActive.bus_id)}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{routeName(myActive.route_id)}</p>
            <Progress value={Math.round((myActive.occupancy/myActive.capacity)*100)} className="mt-3" />
            <p className="mt-1 text-xs text-muted-foreground">{myActive.occupancy}/{myActive.capacity} riders · GPS {tracking!==null ? "live" : "off"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tracking===null ? <Button onClick={()=>startGps(myActive)} className="bg-primary"><MapPin className="mr-2 h-4 w-4"/>Share GPS</Button> : <Button onClick={stopGps} variant="outline">Pause GPS</Button>}
              <Button onClick={()=>endTrip(myActive)} variant="destructive"><Square className="mr-2 h-4 w-4"/>End trip</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="trips" className="shadow-soft scroll-mt-20">
          <CardHeader><CardTitle className="flex items-center gap-2"><Bus className="h-5 w-5 text-primary"/>Available trips</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {trips.length === 0 && (
              <p className="text-sm text-muted-foreground">No trips available.</p>
            )}
            {trips.map(t => {
              const mine = t.driver_id === user?.id;
              const isActive = t.status === "active";
              const isCompleted = t.status === "completed";
              return (
                <div key={t.id} className="flex items-center justify-between rounded-xl border p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold">{busNumber(t.bus_id)}</span>
                      <Badge variant={isActive ? "default" : isCompleted ? "secondary" : "outline"} className="capitalize">{t.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{routeName(t.route_id)}</p>
                  </div>
                  {isCompleted ? (
                    <Button disabled variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                      <Square className="mr-2 h-4 w-4"/>Completed
                    </Button>
                  ) : mine && isActive ? (
                    <div className="flex gap-2">
                      <Button disabled variant="outline" className="border-success/50 text-success">
                        <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-success"/>In progress
                      </Button>
                      <Button onClick={()=>endTrip(t)} variant="destructive" size="sm">
                        <Square className="mr-2 h-4 w-4"/>End
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={()=>startTrip(t)} disabled={!!myActive || startingId===t.id} className="bg-primary">
                      {startingId===t.id
                        ? <><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"/>Starting…</>
                        : <><Play className="mr-2 h-4 w-4"/>Start trip</>}
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-accent"/>My issue reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {issues.length === 0 && (
              <p className="text-sm text-muted-foreground">No reports submitted yet. Use “Report issue” above to log a problem.</p>
            )}
            {issues.map(i => (
              <div key={i.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={i.severity === "high" ? "destructive" : i.severity === "low" ? "secondary" : "default"}>{i.severity}</Badge>
                  <Badge variant="outline" className="capitalize">{i.kind}</Badge>
                  <Badge variant={i.status === "open" ? "default" : i.status === "resolved" ? "secondary" : "outline"} className="capitalize">{i.status}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3"/>{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</span>
                </div>
                <p className="mt-2 text-sm">{i.description}</p>
                {i.bus_id && <p className="mt-1 text-xs text-muted-foreground">Bus {busNumber(i.bus_id)}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function ReportIssue({ buses, defaultBusId, tripId }: { buses: BusRow[]; defaultBusId: string | null; tripId: string | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busId, setBusId] = useState<string>(defaultBusId ?? "none");
  const [kind, setKind] = useState<string>("mechanical");
  const [severity, setSeverity] = useState<string>("medium");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setBusId(defaultBusId ?? "none"); }, [defaultBusId]);

  async function submit() {
    if (!user) return;
    if (!desc.trim() || desc.trim().length < 5) { toast.error("Add a short description (5+ chars)"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("issues").insert({
      reporter_id: user.id,
      bus_id: busId !== "none" ? busId : null,
      trip_id: tripId,
      kind,
      severity,
      description: desc.trim(),
    });
    if (error) { setSubmitting(false); toast.error(error.message); return; }

    // Notify all admins so they get an instant bell alert
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    if (admins?.length) {
      await supabase.from("notifications").insert(
        admins.map(a => ({
          user_id: a.user_id,
          kind: "issue",
          title: `New ${severity} ${kind} report`,
          body: desc.trim().slice(0, 200),
        }))
      );
    }

    setSubmitting(false);
    toast.success("Report sent to admin");
    setOpen(false);
    setDesc("");
    setSeverity("medium");
    setKind("mechanical");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-amber-gradient text-accent-foreground"><Wrench className="mr-2 h-4 w-4"/>Report issue</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-accent"/>Report a bus issue</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Issue type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mechanical">Mechanical fault</SelectItem>
                <SelectItem value="delay">Delay</SelectItem>
                <SelectItem value="incident">Incident / safety</SelectItem>
                <SelectItem value="fuel">Fuel</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Bus (optional)</Label>
              <Select value={busId} onValueChange={setBusId}>
                <SelectTrigger><SelectValue placeholder="Select bus" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No specific bus —</SelectItem>
                  {buses.map(b => <SelectItem key={b.id} value={b.id}>Bus {b.bus_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Details</Label>
            <Textarea
              value={desc}
              onChange={e=>setDesc(e.target.value.slice(0, 1000))}
              placeholder="Describe the problem, location, and any context…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">{desc.length}/1000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-primary">
            <AlertTriangle className="mr-2 h-4 w-4"/>{submitting ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
