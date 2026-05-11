import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveMap } from "@/components/LiveMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Bus, Users, AlertTriangle, Activity, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: AdminPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; eta_minutes: number; delay_minutes: number; }
interface BusRow { id: string; bus_number: string; capacity: number; status: string; current_lat: number | null; current_lng: number | null; }
interface RouteRow { id: string; name: string; }
interface Issue { id: string; description: string; severity: string; status: string; kind: string; created_at: string; }

function AdminPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  useEffect(() => {
    const load = async () => {
      const [t, b, r, i] = await Promise.all([
        supabase.from("trips").select("*").order("created_at",{ascending:false}),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
        supabase.from("issues").select("*").order("created_at",{ascending:false}).limit(10),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as BusRow[]);
      setRoutes((r.data ?? []) as RouteRow[]);
      setIssues((i.data ?? []) as Issue[]);
    };
    load();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"trips"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"buses"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"issues"},load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const busNumber = (id: string) => buses.find(b=>b.id===id)?.bus_number ?? "—";
  const routeName = (id: string) => routes.find(r=>r.id===id)?.name ?? "Route";
  const activeBuses = buses.filter(b=>b.current_lat&&b.current_lng).map(b=>({id:b.id,bus_number:b.bus_number,lat:b.current_lat!,lng:b.current_lng!}));
  const fullTrips = trips.filter(t=>t.status==="full");
  const totalOccupancy = trips.filter(t=>t.status==="active"||t.status==="full").reduce((s,t)=>s+t.occupancy,0);
  const totalCapacity = trips.filter(t=>t.status==="active"||t.status==="full").reduce((s,t)=>s+t.capacity,0);

  async function deploySecondBus(t: Trip) {
    const idle = buses.find(b=>b.status==="idle"&&b.id!==t.bus_id);
    if (!idle) { toast.error("No idle bus available"); return; }
    const { data: newTrip, error } = await supabase.from("trips").insert({
      bus_id: idle.id, route_id: t.route_id, status: "active",
      occupancy: 0, capacity: idle.capacity, eta_minutes: t.eta_minutes + 5, parent_trip_id: t.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("buses").update({ status: "active" }).eq("id", idle.id);
    // move waiting queue
    const { data: q } = await supabase.from("waiting_queue").select("*").eq("trip_id", t.id).eq("status","waiting");
    if (q && q.length) {
      for (const item of q) {
        await supabase.from("bookings").insert({ trip_id: newTrip.id, user_id: item.user_id });
        await supabase.from("waiting_queue").update({ status: "moved" }).eq("id", item.id);
        await supabase.from("notifications").insert({ user_id: item.user_id, title: "Second bus deployed", body: `You have been moved to ${idle.bus_number}.`, kind: "queue" });
      }
    }
    toast.success(`Deployed ${idle.bus_number}`);
  }

  async function markDelay(t: Trip) {
    const minutes = 15;
    await supabase.from("trips").update({ delay_minutes: minutes, status: "delayed", eta_minutes: t.eta_minutes + minutes }).eq("id", t.id);
    toast.success("Delay reported");
  }

  return (
    <DashboardShell requireRole="admin">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Operations control</h1>
          <p className="text-muted-foreground">Live overview of the entire transport network.</p>
        </div>
      </div>

      <div id="overview" className="grid gap-4 md:grid-cols-4 scroll-mt-20">
        <Stat icon={<Bus />} label="Buses" value={buses.length} />
        <Stat icon={<Activity />} label="Active trips" value={trips.filter(t=>t.status==="active"||t.status==="full").length} accent />
        <Stat icon={<Users />} label="Riders onboard" value={`${totalOccupancy}/${totalCapacity || "-"}`} />
        <Stat icon={<AlertTriangle />} label="Open issues" value={issues.filter(i=>i.status==="open").length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden shadow-soft">
          <CardHeader><CardTitle>Live fleet map</CardTitle></CardHeader>
          <CardContent className="p-0"><LiveMap buses={activeBuses} height={420} /></CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader><CardTitle>Issues</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-auto">
            {issues.length===0 && <p className="text-sm text-muted-foreground">All clear.</p>}
            {issues.map(i=>(
              <div key={i.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between"><Badge variant={i.status==="open"?"destructive":"secondary"}>{i.status}</Badge><span className="text-[10px] text-muted-foreground">{i.kind}</span></div>
                <p className="mt-1 text-sm">{i.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {fullTrips.length > 0 && (
        <Card className="mt-6 border-warning/50 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 text-warning"><AlertTriangle className="h-5 w-5" />Full buses — deploy second?</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {fullTrips.map(t=>(
              <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
                <div><p className="font-display font-bold">{busNumber(t.bus_id)}</p><p className="text-xs text-muted-foreground">{routeName(t.route_id)}</p></div>
                <Button onClick={()=>deploySecondBus(t)} className="bg-amber-gradient text-accent-foreground">Deploy second bus</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6 shadow-soft">
        <CardHeader><CardTitle>All trips</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {trips.length===0 && <p className="text-sm text-muted-foreground">No trips.</p>}
          {trips.map(t=>{
            const pct = Math.round((t.occupancy/t.capacity)*100);
            return (
              <div key={t.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-display font-bold">{busNumber(t.bus_id)}</span>
                    <Badge>{t.status}</Badge>
                    {t.delay_minutes>0 && <Badge variant="outline" className="border-warning text-warning">+{t.delay_minutes}m</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={()=>markDelay(t)}>Report delay</Button>
                    {t.status!=="completed" && <Button size="sm" variant="ghost" onClick={async()=>{await supabase.from("trips").update({status:"completed",ended_at:new Date().toISOString()}).eq("id",t.id);toast.success("Trip closed");}}><CheckCircle2 className="mr-1 h-4 w-4"/>End</Button>}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{routeName(t.route_id)}</p>
                <Progress value={pct} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">{t.occupancy}/{t.capacity} · ETA {t.eta_minutes}m</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: boolean }) {
  return (
    <Card className={`shadow-soft ${accent ? "border-accent/50" : ""}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${accent ? "bg-amber-gradient text-accent-foreground" : "bg-primary text-primary-foreground"}`}>{icon}</div>
        <div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p></div>
      </CardContent>
    </Card>
  );
}
