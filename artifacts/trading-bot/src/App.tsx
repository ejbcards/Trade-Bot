import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/Dashboard";
import Brokers from "@/pages/Brokers";
import Strategies from "@/pages/Strategies";
import Positions from "@/pages/Positions";
import Trades from "@/pages/Trades";
import Reports from "@/pages/Reports";
import Chat from "@/pages/Chat";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/brokers" component={Brokers} />
      <Route path="/strategies" component={Strategies} />
      <Route path="/positions" component={Positions} />
      <Route path="/trades" component={Trades} />
      <Route path="/reports" component={Reports} />
      <Route path="/chat" component={Chat} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="dark min-h-screen bg-background text-foreground">
            <Router />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
