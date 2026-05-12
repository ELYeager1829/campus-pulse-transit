import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveMap } from "@/components/LiveMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Bus, Users, AlertTriangle, Activity, CheckCircle2, Wrench, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin")({ component: AdminPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; eta_minutes: number; delay_minutes: number; }
interface BusRow { id: string; bus_number: string; capacity: number; status: string; current_lat: number | null; current_lng: number | null; }
interface RouteRow { id: string; name: string; origin: string; destination: string; estimated_duration_min: number; times?: string[] | null; }
interface Issue { id: string; description: string; severity: string; status: string; kind: string; created_at: string; bus_id?: string | null; trip_id?: string | null; reporter_id?: string; }
interface ProfileLite { id: string; full_name: string; matric_no?: string | null; }
interface RoleRow { user_id: string; role: string; }

function AdminPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  useEffect(() => {
    const load = async () => {
      const [t, b, r, i, p, ur] = await Promise.all([
        supabase.from("trips").select("*").order("created_at",{ascending:false}),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
        supabase.from("issues").select("*").order("created_at",{ascending:false}).limit(20),
        supabase.from("profiles").select("id,full_name,matric_no"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as BusRow[]);
      setRoutes((r.data ?? []) as RouteRow[]);
      setIssues((i.data ?? []) as Issue[]);
      setProfiles((p.data ?? []) as ProfileLite[]);
      setRoleRows((ur.data ?? []) as RoleRow[]);
    };
    load();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"trips"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"buses"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"issues"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"routes"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"user_roles"},load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function updateIssueStatus(id: string, status: string) {
    const { error } = await supabase.from("issues").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(`Issue marked ${status}`);
    setActiveIssue(null);
  }

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
        <Card id="map" className="lg:col-span-2 overflow-hidden shadow-soft scroll-mt-20">
          <CardHeader><CardTitle>Live fleet map</CardTitle></CardHeader>
          <CardContent className="p-0"><LiveMap buses={activeBuses} height={420} /></CardContent>
        </Card>

        <Card id="issues" className="shadow-soft scroll-mt-20">
          <CardHeader><CardTitle>Issues</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-auto">
            {issues.length===0 && <p className="text-sm text-muted-foreground">All clear.</p>}
            {issues.map(i=>(
              <button
                key={i.id}
                onClick={()=>setActiveIssue(i)}
                className="w-full text-left rounded-lg border p-3 transition hover:bg-muted/50 hover:shadow-soft"
              >
                <div className="flex items-start justify-between">
                  <Badge variant={i.status==="open"?"destructive":"secondary"}>{i.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">{i.kind}</span>
                </div>
                <p className="mt-1 text-sm line-clamp-2">{i.description}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {fullTrips.length > 0 && (
        <Card id="full-buses" className="mt-6 border-warning/50 shadow-soft scroll-mt-20">
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

      <Card id="trips" className="mt-6 shadow-soft scroll-mt-20">
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

      <MaintenanceSection
        buses={buses}
        routes={routes}
        profiles={profiles}
        roleRows={roleRows}
      />

      {/* Issue detail / handling dialog */}
      <Dialog open={!!activeIssue} onOpenChange={(o)=>!o && setActiveIssue(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent"/>Issue details
            </DialogTitle>
            <DialogDescription>Review and update this report.</DialogDescription>
          </DialogHeader>
          {activeIssue && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={activeIssue.severity==="high"?"destructive":activeIssue.severity==="low"?"secondary":"default"}>{activeIssue.severity}</Badge>
                <Badge variant="outline" className="capitalize">{activeIssue.kind}</Badge>
                <Badge variant={activeIssue.status==="open"?"destructive":activeIssue.status==="resolved"?"secondary":"outline"} className="capitalize">{activeIssue.status}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{formatDistanceToNow(new Date(activeIssue.created_at), { addSuffix: true })}</span>
              </div>
              {activeIssue.bus_id && <p className="text-xs text-muted-foreground">Bus: <span className="font-mono">{busNumber(activeIssue.bus_id)}</span></p>}
              <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeIssue.description}</div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {activeIssue?.status !== "in_progress" && (
              <Button variant="outline" onClick={()=>activeIssue && updateIssueStatus(activeIssue.id, "in_progress")}>
                <Wrench className="mr-2 h-4 w-4"/>Mark in progress
              </Button>
            )}
            {activeIssue?.status !== "resolved" && (
              <Button onClick={()=>activeIssue && updateIssueStatus(activeIssue.id, "resolved")} className="bg-primary">
                <CheckCircle2 className="mr-2 h-4 w-4"/>Resolve
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function MaintenanceSection({ buses, routes, profiles, roleRows }: {
  buses: BusRow[]; routes: RouteRow[]; profiles: ProfileLite[]; roleRows: RoleRow[];
}) {
  const [busNum, setBusNum] = useState(""); const [busCap, setBusCap] = useState("40");
  const [rName, setRName] = useState(""); const [rOrigin, setROrigin] = useState(""); const [rDest, setRDest] = useState("");

  async function addBus() {
    if (!busNum.trim()) return toast.error("Bus number required");
    const { error } = await supabase.from("buses").insert({ bus_number: busNum.trim(), capacity: Number(busCap) || 40 });
    if (error) toast.error(error.message); else { toast.success("Bus added"); setBusNum(""); }
  }
  async function deleteBus(id: string) {
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Bus removed");
  }
  async function addRoute() {
    if (!rName.trim() || !rOrigin.trim() || !rDest.trim()) return toast.error("All route fields required");
    const { error } = await supabase.from("routes").insert({ name: rName.trim(), origin: rOrigin.trim(), destination: rDest.trim(), stops: [] });
    if (error) toast.error(error.message); else { toast.success("Route added"); setRName(""); setROrigin(""); setRDest(""); }
  }
  async function deleteRoute(id: string) {
    const { error } = await supabase.from("routes").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Route removed");
  }
  async function changeRole(userId: string, role: "student"|"driver"|"marshal"|"admin") {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message); else toast.success(`Role updated to ${role}`);
  }

  const roleOf = (uid: string) => roleRows.find(r => r.user_id === uid)?.role ?? "student";

  return (
    <Card id="manage" className="mt-6 shadow-soft scroll-mt-20 animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-accent"/>Maintenance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Buses */}
        <section>
          <h3 className="font-display font-bold mb-3 flex items-center gap-2"><Bus className="h-4 w-4"/>Buses ({buses.length})</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <Input placeholder="Bus number" value={busNum} onChange={e=>setBusNum(e.target.value)} className="w-40"/>
            <Input type="number" placeholder="Capacity" value={busCap} onChange={e=>setBusCap(e.target.value)} className="w-28"/>
            <Button onClick={addBus} className="bg-primary"><Plus className="mr-1 h-4 w-4"/>Add bus</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Capacity</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {buses.map(b=>(
                  <TableRow key={b.id}>
                    <TableCell className="font-mono">{b.bus_number}</TableCell>
                    <TableCell>{b.capacity}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{b.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={()=>deleteBus(b.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Routes */}
        <section>
          <h3 className="font-display font-bold mb-3 flex items-center gap-2"><FileText className="h-4 w-4"/>Routes ({routes.length})</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <Input placeholder="Name" value={rName} onChange={e=>setRName(e.target.value)} className="w-48"/>
            <Input placeholder="Origin" value={rOrigin} onChange={e=>setROrigin(e.target.value)} className="w-40"/>
            <Input placeholder="Destination" value={rDest} onChange={e=>setRDest(e.target.value)} className="w-40"/>
            <Button onClick={addRoute} className="bg-primary"><Plus className="mr-1 h-4 w-4"/>Add route</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>From → To</TableHead><TableHead>Times</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {routes.map(r=>(
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.origin} → {r.destination}</TableCell>
                    <TableCell className="text-xs font-mono">{(r.times ?? []).join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={()=>deleteRoute(r.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* People */}
        <section>
          <h3 className="font-display font-bold mb-3 flex items-center gap-2"><Users className="h-4 w-4"/>People ({profiles.length})</h3>
          <p className="text-xs text-muted-foreground mb-3">Assign roles for marshals, drivers, students. New accounts must sign up via the auth page.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Matric #</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
              <TableBody>
                {profiles.map(p=>(
                  <TableRow key={p.id}>
                    <TableCell>{p.full_name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.matric_no || "—"}</TableCell>
                    <TableCell>
                      <Select value={roleOf(p.id)} onValueChange={(v)=>changeRole(p.id, v as "student"|"driver"|"marshal"|"admin")}>
                        <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="driver">Driver</SelectItem>
                          <SelectItem value="marshal">Marshal</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </CardContent>
    </Card>
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
