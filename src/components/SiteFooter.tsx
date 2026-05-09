import { Link } from "@tanstack/react-router";
import { Bus, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, Youtube } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-gradient text-accent-foreground">
              <Bus className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold">Campus<span className="text-accent">Bus</span></span>
          </div>
          <p className="mt-3 text-sm text-primary-foreground/70">
            Smart campus transport for students, drivers, marshals and admins.
          </p>
        </div>

        <div>
          <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">Roles</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/auth" className="hover:text-accent">Student</Link></li>
            <li><Link to="/auth" className="hover:text-accent">Driver</Link></li>
            <li><Link to="/auth" className="hover:text-accent">Marshal</Link></li>
            <li><Link to="/auth" className="hover:text-accent">Admin</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">Contact us</h4>
          <ul className="mt-3 space-y-2 text-sm text-primary-foreground/80">
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-accent" /> support@buslink.app</li>
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-accent" /> +27 11 555 0199</li>
            <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" /> Campus Transport Office</li>
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">Follow us</h4>
          <div className="mt-3 flex gap-3">
            {[
              { Icon: Facebook, label: "Facebook", href: "#" },
              { Icon: Twitter, label: "Twitter", href: "#" },
              { Icon: Instagram, label: "Instagram", href: "#" },
              { Icon: Linkedin, label: "LinkedIn", href: "#" },
              { Icon: Youtube, label: "YouTube", href: "#" },
            ].map(({ Icon, label, href }) => (
              <a key={label} href={href} aria-label={label} target="_blank" rel="noreferrer"
                 className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-accent hover:text-accent-foreground">
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-4 text-xs text-primary-foreground/60">
          © {year} CampusBus · Smart Campus Bus Management System
        </div>
      </div>
    </footer>
  );
}
