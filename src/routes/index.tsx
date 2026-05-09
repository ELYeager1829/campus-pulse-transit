import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bus, MapPin, QrCode, Bell, ShieldCheck, Activity, ArrowRight, Mail, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, dashboardPath } from "@/lib/auth";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Campus Bus — Live university transport" },
      { name: "description", content: "Realtime bus tracking, QR boarding, seat booking, and queue management for your campus." },
      { property: "og:title", content: "Smart Campus Bus — Live university transport" },
      { property: "og:description", content: "Track buses live, book seats, and board with QR — built for students, drivers, marshals and admins." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && role) navigate({ to: dashboardPath(role) });
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2 text-primary-foreground">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-gradient text-accent-foreground shadow-soft">
              <Bus className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Campus<span className="text-accent">Bus</span></span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#contact" className="hidden md:inline-flex"><Button variant="ghost" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">Contact</Button></a>
            <Link to="/auth"><Button variant="ghost" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">Sign in</Button></Link>
            <Link to="/auth"><Button className="bg-accent text-accent-foreground hover:bg-accent/90">Get started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero pt-32 pb-24">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_20%,white_0%,transparent_45%),radial-gradient(circle_at_80%_70%,oklch(0.85_0.18_80)_0%,transparent_40%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
          <div className="text-primary-foreground">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live realtime tracking
            </div>
            <h1 className="font-display text-5xl font-bold leading-[1.05] text-balance md:text-6xl">
              Your campus, <span className="text-accent">moving smarter.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              A live transport command center for students, drivers, marshals and admins. Track buses, book seats, scan QR boarding passes, and skip the queue.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-glow">
                  Open the app <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "signup" } as never}>
                <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-primary-foreground hover:bg-white/10">
                  Create an account
                </Button>
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-6 text-sm text-white/80">
              <Stat n="< 30s" l="ETA refresh" />
              <Stat n="100%" l="Realtime sync" />
              <Stat n="4 roles" l="One platform" />
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-3 shadow-elevated backdrop-blur-xl">
              <div className="rounded-2xl bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Bus 14 · Main Gate → Library</p>
                    <p className="font-display text-2xl font-bold">Arriving in 2 min</p>
                  </div>
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-gradient text-accent-foreground">
                    <Bus className="h-6 w-6" />
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[72%] bg-amber-gradient" />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>Occupancy</span><span className="font-semibold text-foreground">51 / 70 seats</span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <Mini icon={<MapPin className="h-4 w-4" />} label="Live map" />
                  <Mini icon={<QrCode className="h-4 w-4" />} label="QR ticket" />
                  <Mini icon={<Bell className="h-4 w-4" />} label="Alerts" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Everything you need</p>
          <h2 className="mt-2 font-display text-4xl font-bold">A command center for campus transport</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<MapPin />} title="Live bus tracking" desc="Real GPS pings from drivers, plotted on the map for everyone." />
          <Feature icon={<QrCode />} title="QR boarding" desc="Each seat booking generates a scannable QR for marshals." />
          <Feature icon={<Activity />} title="ETA & delay engine" desc="Auto-recalculated arrival times with delay alerts." />
          <Feature icon={<Bus />} title="Auto second bus" desc="When a bus fills up, admins deploy a second trip in one tap." />
          <Feature icon={<Bell />} title="Realtime notifications" desc="Booking, approaching, full, queued, deployed — instant." />
          <Feature icon={<ShieldCheck />} title="Role-based access" desc="Students, drivers, marshals and admins each get their own dashboard." />
        </div>
      </section>

      <ContactSection />

      <SiteFooter />
    </div>
  );
}

function ContactSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || message.trim().length < 5) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setName(""); setEmail(""); setMessage("");
      toast.success("Thanks! We'll get back to you shortly.");
    }, 600);
  }

  return (
    <section id="contact" className="border-t bg-secondary/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Contact us</p>
          <h2 className="mt-2 font-display text-4xl font-bold">We'd love to hear from you</h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Questions, feedback or campus partnerships — drop us a message and our team will reply within one business day.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-gradient text-accent-foreground"><Mail className="h-4 w-4"/></span>support@buslink.app</li>
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-gradient text-accent-foreground"><Phone className="h-4 w-4"/></span>+27 11 555 0199</li>
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-gradient text-accent-foreground"><MapPin className="h-4 w-4"/></span>Campus Transport Office, Main Gate</li>
          </ul>
        </div>
        <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@campus.edu" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder="How can we help?" />
            </div>
            <Button type="submit" disabled={sending} className="bg-primary">
              <Send className="mr-2 h-4 w-4"/>{sending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-bold text-accent">{n}</div>
      <div className="text-xs uppercase tracking-wider">{l}</div>
    </div>
  );
}
function Mini({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-secondary p-3 text-secondary-foreground">
      {icon}<span className="text-[11px] font-medium">{label}</span>
    </div>
  );
}
function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground transition group-hover:bg-amber-gradient group-hover:text-accent-foreground">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
