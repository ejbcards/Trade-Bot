import { Link, useLocation } from "wouter";
import { LayoutDashboard, Wallet, BrainCircuit, PieChart, ActivitySquare, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Brokers", href: "/brokers", icon: Wallet },
  { name: "Strategies", href: "/strategies", icon: BrainCircuit },
  { name: "Positions", href: "/positions", icon: PieChart },
  { name: "Trades", href: "/trades", icon: ActivitySquare },
  { name: "Reports", href: "/reports", icon: BarChart2 },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 border-r bg-sidebar flex flex-col h-full flex-shrink-0">
      <div className="h-16 flex items-center px-6 border-b">
        <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
          <BrainCircuit className="w-6 h-6" />
          <span>NexusTrade</span>
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
