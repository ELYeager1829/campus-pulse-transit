import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AppRole } from "@/lib/auth";
import {
  Map, Ticket, Bell, AlertTriangle, Bus, Wrench, ScanLine, Users,
  Activity, FileWarning, LayoutDashboard, Clock,
} from "lucide-react";

type Item = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };

const navByRole: Record<AppRole, Item[]> = {
  student: [
    { id: "map", label: "Live map", icon: Map },
    { id: "routes", label: "Available routes", icon: Bus },
    { id: "ticket", label: "My ticket", icon: Ticket },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "report", label: "Report issue", icon: AlertTriangle },
  ],
  driver: [
    { id: "active-trip", label: "Active trip", icon: Activity },
    { id: "trips", label: "Available trips", icon: Bus },
    { id: "reports", label: "My reports", icon: FileWarning },
    { id: "report", label: "Report issue", icon: Wrench },
  ],
  marshal: [
    { id: "scanner", label: "QR scanner", icon: ScanLine },
    { id: "incoming", label: "Incoming buses", icon: Users },
  ],
  admin: [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "map", label: "Live fleet map", icon: Map },
    { id: "issues", label: "Issues", icon: AlertTriangle },
    { id: "full-buses", label: "Full buses", icon: Clock },
    { id: "trips", label: "All trips", icon: Bus },
  ],
};

export function RoleSidebar({ role }: { role: AppRole }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [active, setActive] = useState<string>("");
  const items = navByRole[role];

  useEffect(() => {
    const onScroll = () => {
      let current = "";
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 120) current = it.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="capitalize">{role} menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild isActive={active === item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex items-center gap-2 hover:bg-muted/50"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.label}</span>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
