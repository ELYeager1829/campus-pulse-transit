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
      { title: "CampusBus — Live university transport for TUT" },
      { name: "description", content: "Realtime bus tracking, QR boarding, seat booking, and queue management for TUT students, drivers, marshals and admins." },
      { property: "og:title", content: "CampusBus — Live university transport" },
      { property: "og:description", content: "Track buses live, book seats, and board with QR — built for TUT campuses." },
      { property: "og:url", content: "https://campus-pulse-transit.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://campus-pulse-transit.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "CampusBus",
              url: "https://campus-pulse-transit.lovable.app/",
              description: "Smart campus bus management for Tshwane University of Technology.",
            },
            {
              "@type": "WebSite",
              name: "CampusBus",
              url: "https://campus-pulse-transit.lovable.app/",
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

const BUS_HERO_IMG = "data:image/jpeg;base64,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";

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
      <section
        className="relative overflow-hidden pt-32 pb-24"
        style={{
          backgroundImage: `url(${BUS_HERO_IMG})`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
        }}
      >
        {/* Dark overlay to blend the photo with the existing hero palette */}
        <div className="absolute inset-0 bg-hero opacity-85" />
        {/* Subtle radial highlights — unchanged from original */}
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
            </div>
            <div className="mt-10 grid grid-cols-3 gap-6 text-sm text-white/80">
              <Stat n=" 30s" l="ETA refresh" />
              <Stat n="93,95%" l="Realtime sync" />
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
