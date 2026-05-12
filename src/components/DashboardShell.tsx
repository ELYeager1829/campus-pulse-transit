import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, dashboardPath, type AppRole } from "@/lib/auth";
import { toast } from "sonner";
import { SiteFooter } from "@/components/SiteFooter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RoleSidebar } from "@/components/RoleSidebar";
import { NotificationsBell } from "@/components/NotificationsBell";

export function DashboardShell({ children, requireRole }: { children: React.ReactNode; requireRole: AppRole }) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (role && role !== requireRole) navigate({ to: dashboardPath(role) });
  }, [user, role, loading, navigate, requireRole]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  if (loading || !user) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <RoleSidebar role={requireRole} />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <Link to="/" className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-gradient text-accent-foreground"><Bus className="h-5 w-5" /></div>
                  <div className="leading-tight">
                    <div className="font-display font-bold">CampusBus</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{requireRole}</div>
                  </div>
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Button size="icon" variant="ghost"><Bell className="h-5 w-5" /></Button>
                  {unread > 0 && <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full bg-accent px-1.5 text-[10px] text-accent-foreground">{unread}</Badge>}
                </div>
                <Button onClick={signOut} variant="ghost" size="sm"><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
          <SiteFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}
