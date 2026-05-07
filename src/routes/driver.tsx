import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Bus, Play, Square, MapPin, AlertTriangle, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/driver")({ component: DriverPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; driver_id: string | null; }
interface BusRow { id: string; bus_number: string; }
interface RouteRow { id: string; name: string; }

function DriverPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [tracking, setTracking] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const [t, b, r] = await Promise.all([
        supabase.from("trips").select("*").or(`driver_id.eq.${user?.id ?? ""},driver_id.is.null`).order("created_at",{ascending:false}),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as BusRow[]);
      setRoutes((r.data ?? []) as RouteRow[]);
    };
    if (user) load();
    const ch = supabase.channel("driver-live").on("postgres_changes",{event:"*",schema:"public",table:"trips"}, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const busNumber = (id: string) => buses.find(b=>b.id===id)?.bus_number ?? "—";
  const routeName = (id: string) => routes.find(r=>r.id===id)?.name ?? "Route";
  const myActive = trips.find(t => t.driver_id === user?.id && t.status === "active");

  async function startTrip(t: Trip) {
    if (!user) return;
    await supabase.from("trips").update({ driver_id: user.id, status: "active", started_at: new Date().toISOString() }).eq("id", t.id);
    await supabase.from("buses").update({ driver_id: user.id, status: "active" }).eq("id", t.bus_id);
    toast.success("Trip started");
    startGps(t);
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

  return (
    <DashboardShell requireRole="driver">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Driver</h1>
        <p className="text-muted-foreground">Manage your trips and share live location.</p>
      </div>

      {myActive && (
        <Card className="mb-6 border-success/50 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 text-success"><MapPin className="h-5 w-5" />On a trip · {busNumber(myActive.bus_id)}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{routeName(myActive.route_id)}</p>
            <Progress value={Math.round((myActive.occupancy/myActive.capacity)*100)} className="mt-3" />
            <p className="mt-1 text-xs text-muted-foreground">{myActive.occupancy}/{myActive.capacity} riders · GPS {tracking!==null ? "live" : "off"}</p>
            <div className="mt-4 flex gap-2">
              {tracking===null ? <Button onClick={()=>startGps(myActive)} className="bg-primary"><MapPin className="mr-2 h-4 w-4"/>Share GPS</Button> : <Button onClick={stopGps} variant="outline">Pause GPS</Button>}
              <Button onClick={()=>endTrip(myActive)} variant="destructive"><Square className="mr-2 h-4 w-4"/>End trip</Button>
              <ReportMaintenance busId={myActive.bus_id} tripId={myActive.id} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-soft">
        <CardHeader><CardTitle>Available trips</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {trips.filter(t=>t.status!=="completed").map(t=>(
            <div key={t.id} className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <div className="flex items-center gap-2"><span className="font-display font-bold">{busNumber(t.bus_id)}</span><Badge>{t.status}</Badge></div>
                <p className="text-sm text-muted-foreground">{routeName(t.route_id)}</p>
              </div>
              {t.driver_id === user?.id && t.status==="active"
                ? <Button onClick={()=>endTrip(t)} variant="outline"><Square className="mr-2 h-4 w-4"/>End</Button>
                : <Button onClick={()=>startTrip(t)} disabled={!!myActive} className="bg-primary"><Play className="mr-2 h-4 w-4"/>Start</Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

function ReportMaintenance({ busId, tripId }: { busId: string; tripId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  async function submit() {
    if (!user || !desc.trim()) return;
    const { error } = await supabase.from("issues").insert({ reporter_id: user.id, bus_id: busId, trip_id: tripId, description: desc, kind: "maintenance", severity: "high" });
    if (error) toast.error(error.message); else { toast.success("Reported"); setOpen(false); setDesc(""); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Wrench className="mr-2 h-4 w-4"/>Maintenance</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report maintenance issue</DialogTitle></DialogHeader>
        <Textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe the issue…" />
        <Button onClick={submit} className="bg-primary"><AlertTriangle className="mr-2 h-4 w-4"/>Submit</Button>
      </DialogContent>
    </Dialog>
  );
}
