import { Link, useLocation } from "wouter";
import { LayoutDashboard, Wallet, PieChart, ActivitySquare, BarChart2, BrainCircuit, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import logoUrl from "/logo.png";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Brokers", href: "/brokers", icon: Wallet },
  { name: "Strategies", href: "/strategies", icon: BrainCircuit },
  { name: "Positions", href: "/positions", icon: PieChart },
  { name: "Trades", href: "/trades", icon: ActivitySquare },
  { name: "Reports", href: "/reports", icon: BarChart2 },
  { name: "Talk to Moose", href: "/chat", icon: MessageCircle },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 border-r bg-sidebar flex flex-col h-full flex-shrink-0">
      <div className="h-16 flex items-center px-6 border-b">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight" style={{ color: "hsl(43 55% 52%)" }}>
          <img src={logoUrl} alt="GoldenMoose" className="w-8 h-8 object-contain" />
          <span>GoldenMoose</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                data-testid={`nav-${item.name.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group font-medium text-sm",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5",
                    isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                  )}
                />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t text-xs text-muted-foreground">
        <div>System Status: <span className="text-emerald-500 font-semibold">Online</span></div>
        <div className="mt-1">Version: 2.1.0</div>
      </div>
    </aside>
  );
}
