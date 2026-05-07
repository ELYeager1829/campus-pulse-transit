import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, ScanLine, Users, AlertTriangle, Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
import { Scanner } from "@yudiel/react-qr-scanner";

export const Route = createFileRoute("/marshal")({ component: MarshalPage });

interface Trip { id: string; bus_id: string; route_id: string; status: string; occupancy: number; capacity: number; }
interface BusRow { id: string; bus_number: string; }
interface RouteRow { id: string; name: string; }
interface Booking { id: string; qr_code: string; status: string; user_id: string; trip_id: string; }

function MarshalPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [scan, setScan] = useState("");
  const [recent, setRecent] = useState<Booking[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    const load = async () => {
      const [t, b, r, bk] = await Promise.all([
        supabase.from("trips").select("*").in("status",["active","scheduled","full","delayed"]),
        supabase.from("buses").select("*"),
        supabase.from("routes").select("*"),
        supabase.from("bookings").select("*").eq("status","boarded").order("created_at",{ascending:false}).limit(8),
      ]);
      setTrips((t.data ?? []) as Trip[]);
      setBuses((b.data ?? []) as BusRow[]);
      setRoutes((r.data ?? []) as RouteRow[]);
      setRecent((bk.data ?? []) as Booking[]);
    };
    load();
    const ch = supabase.channel("marshal-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"trips"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"bookings"},load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const busNumber = (id: string) => buses.find(b=>b.id===id)?.bus_number ?? "—";
  const routeName = (id: string) => routes.find(r=>r.id===id)?.name ?? "Route";

  async function validate(code: string) {
    if (!code.trim()) return;
    const { data, error } = await supabase.from("bookings").select("*").eq("qr_code", code.trim()).maybeSingle();
    if (error || !data) { toast.error("Invalid QR"); return; }
    if (data.status === "boarded") { toast.warning("Already boarded"); return; }
    const { error: u } = await supabase.from("bookings").update({ status: "boarded" }).eq("id", data.id);
    if (u) toast.error(u.message); else toast.success("Boarded ✓");
    setScan("");
    inputRef.current?.focus();
  }

  async function requestNextBus(t: Trip) {
    await supabase.from("notifications").insert({ user_id: t.id, title: "Marshal request", body: "Next bus requested", kind: "marshal" }).then(()=>{});
    // notify admins
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role","admin");
    if (admins) {
      for (const a of admins) {
        await supabase.from("notifications").insert({ user_id: a.user_id, title: "Next bus requested", body: `${busNumber(t.bus_id)} on ${routeName(t.route_id)} needs reinforcement`, kind: "request" });
      }
    }
    toast.success("Admin notified");
  }

  return (
    <DashboardShell requireRole="marshal">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Marshal</h1>
        <p className="text-muted-foreground">Scan tickets, validate boarding, manage queues.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-accent/40 shadow-glow">
          <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-accent"/>QR validator</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 overflow-hidden rounded-lg border bg-black/5 aspect-square relative">
              {cameraOn ? (
                <Scanner
                  onScan={(results) => {
                    const code = results?.[0]?.rawValue;
                    if (!code) return;
                    const now = Date.now();
                    if (code === lastScanRef.current.code && now - lastScanRef.current.at < 2500) return;
                    lastScanRef.current = { code, at: now };
                    validate(code);
                  }}
                  onError={(err) => console.warn("scanner", err)}
                  constraints={{ facingMode: "environment" }}
                  styles={{ container: { width: "100%", height: "100%" }, video: { width: "100%", height: "100%", objectFit: "cover" } }}
                  scanDelay={300}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-sm text-muted-foreground p-4">
                  <span>Camera is off. Tap “Start camera” to scan QR codes with your phone.</span>
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={() => setCameraOn((v) => !v)}
              variant={cameraOn ? "outline" : "default"}
              className="w-full mb-3"
            >
              {cameraOn ? <><CameraOff className="mr-2 h-4 w-4"/>Stop camera</> : <><Camera className="mr-2 h-4 w-4"/>Start camera</>}
            </Button>
            <p className="mb-2 text-xs text-muted-foreground">Or enter code manually:</p>
            <form onSubmit={(e)=>{e.preventDefault();validate(scan);}} className="flex gap-2">
              <Input ref={inputRef} value={scan} onChange={(e)=>setScan(e.target.value)} placeholder="QR code…" />
              <Button type="submit" className="bg-amber-gradient text-accent-foreground"><CheckCircle2 className="mr-1 h-4 w-4"/>Validate</Button>
            </form>
            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Recently boarded</p>
              {recent.length===0 && <p className="text-xs text-muted-foreground">None yet.</p>}
              {recent.map(b=>(
                <div key={b.id} className="flex items-center gap-2 rounded-md bg-secondary p-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success"/><span className="font-mono text-xs">{b.qr_code.slice(0,12)}…</span></div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-accent"/>Incoming buses</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {trips.length===0 && <p className="text-sm text-muted-foreground">No active trips.</p>}
            {trips.map(t=>{
              const pct = Math.round((t.occupancy/t.capacity)*100);
              const full = t.occupancy >= t.capacity;
              return (
                <div key={t.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2"><span className="font-display font-bold">{busNumber(t.bus_id)}</span><Badge variant={full?"destructive":"secondary"}>{t.status}</Badge></div>
                      <p className="text-sm text-muted-foreground">{routeName(t.route_id)}</p>
                    </div>
                    {full && <Button onClick={()=>requestNextBus(t)} variant="outline"><AlertTriangle className="mr-2 h-4 w-4"/>Request next bus</Button>}
                  </div>
                  <Progress value={pct} className="mt-3" />
                  <p className="mt-1 text-xs text-muted-foreground">{t.occupancy}/{t.capacity}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
