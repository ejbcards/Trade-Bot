import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BotNotificationsProvider } from "@/context/BotNotificationsContext";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/Dashboard";
import Brokers from "@/pages/Brokers";
import Strategies from "@/pages/Strategies";
import Positions from "@/pages/Positions";
import Trades from "@/pages/Trades";
import Reports from "@/pages/Reports";
import Chat from "@/pages/Chat";
import Account from "@/pages/Account";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(43 55% 52%)",
    colorForeground: "hsl(40 10% 93%)",
    colorMutedForeground: "hsl(0 0% 62%)",
    colorDanger: "hsl(0 80% 45%)",
    colorBackground: "hsl(0 0% 22%)",
    colorInput: "hsl(0 0% 26%)",
    colorInputForeground: "hsl(40 10% 93%)",
    colorNeutral: "hsl(43 40% 32%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "!bg-[hsl(0_0%_18%)] rounded-xl w-[440px] max-w-full overflow-hidden !border !border-[hsl(43_40%_32%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "!text-[hsl(40_10%_93%)] font-bold",
    headerSubtitle: "!text-[hsl(0_0%_62%)]",
    socialButtonsBlockButtonText: "!text-[hsl(40_10%_93%)]",
    formFieldLabel: "!text-[hsl(40_10%_93%)]",
    footerActionLink: "!text-[hsl(43_55%_52%)]",
    footerActionText: "!text-[hsl(0_0%_62%)]",
    dividerText: "!text-[hsl(0_0%_62%)]",
    identityPreviewEditButton: "!text-[hsl(43_55%_52%)]",
    formFieldSuccessText: "!text-emerald-400",
    alertText: "!text-[hsl(40_10%_93%)]",
    logoBox: "flex justify-center mb-2",
    logoImage: "h-14 w-14",
    socialButtonsBlockButton: "!border-[hsl(43_40%_32%)] !bg-[hsl(0_0%_26%)]",
    formButtonPrimary: "!bg-[hsl(43_55%_52%)] !text-[hsl(0_0%_8%)] font-semibold",
    formFieldInput: "!bg-[hsl(0_0%_26%)] !border-[hsl(43_40%_32%)] !text-[hsl(40_10%_93%)]",
    footerAction: "!bg-transparent",
    dividerLine: "!bg-[hsl(43_40%_32%)]",
    alert: "!border-[hsl(43_40%_32%)] !bg-[hsl(0_0%_22%)]",
    otpCodeFieldInput: "!bg-[hsl(0_0%_26%)] !border-[hsl(43_40%_32%)] !text-[hsl(40_10%_93%)]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/brokers" component={Brokers} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/positions" component={Positions} />
        <Route path="/trades" component={Trades} />
        <Route path="/reports" component={Reports} />
        <Route path="/chat" component={Chat} />
        <Route path="/account" component={Account} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <BotNotificationsProvider>
            <Router />
          </BotNotificationsProvider>
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
