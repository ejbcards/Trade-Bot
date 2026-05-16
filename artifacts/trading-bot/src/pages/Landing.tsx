import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  BrainCircuit,
  ShieldCheck,
  BarChart2,
  Zap,
  TrendingUp,
  ArrowRight,
  Crown,
  CheckCircle2,
  Play,
  Bot,
  LineChart,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logoUrl from "/logo.png";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const YOUTUBE_EMBED_URL = "";

const features = [
  {
    icon: BrainCircuit,
    title: "Claude-Powered AI Signals",
    description:
      "Our flagship Golden Moose Strategy uses Anthropic's Claude to analyze market data and generate high-confidence buy/sell signals in real time.",
  },
  {
    icon: ShieldCheck,
    title: "Built-In Risk Guardrails",
    description:
      "Protect your capital with configurable stop-loss, rolling stops, take-profit targets, RSI filters, and max daily loss limits — all enforced automatically.",
  },
  {
    icon: Wallet,
    title: "Multi-Broker Support",
    description:
      "Connect Schwab, Robinhood, and more from a single dashboard. Monitor buying power and account value across all your brokers simultaneously.",
  },
  {
    icon: LineChart,
    title: "Live Positions & P&L",
    description:
      "Watch your open positions update in real time with unrealized P&L, entry prices, and rolling high-water marks — all in one clean view.",
  },
  {
    icon: BarChart2,
    title: "Performance Reports",
    description:
      "Daily, weekly, monthly, and annual reports show win rate, profit factor, Sharpe ratio, and your top-performing symbols so you can refine your edge.",
  },
  {
    icon: Zap,
    title: "Instant Execution",
    description:
      "Signals are acted on immediately. No manual confirmation needed — the bot executes, logs the trade, and updates your positions automatically.",
  },
];

const steps = [
  {
    number: "01",
    icon: Wallet,
    title: "Connect Your Broker",
    description:
      "Link your Schwab or Robinhood account in seconds. GoldenMoose reads your buying power and manages positions on your behalf.",
  },
  {
    number: "02",
    icon: Bot,
    title: "Pick or Build a Strategy",
    description:
      "Choose the Golden Moose Strategy for instant AI-powered trading, or build your own with custom decision rules and risk parameters.",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Let the Bot Trade",
    description:
      "Start the bot and watch it work. Get real-time alerts, review trade history, and track performance — while you focus on everything else.",
  },
];

const goldenMoosePerks = [
  "Claude AI buy/sell signals",
  "Auto risk management",
  "Multi-broker execution",
  "Rolling stop tracking",
  "VIX volatility filter",
  "RSI overbought/oversold exits",
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const { isSignedIn } = useUser();

  function handleGetStarted() {
    if (isSignedIn) {
      setLocation("/dashboard");
    } else {
      setLocation("/sign-up");
    }
  }

  function handleSignIn() {
    setLocation("/sign-in");
  }

  function handleGoToDashboard() {
    setLocation("/dashboard");
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div
            className="flex items-center gap-2 font-bold text-xl tracking-tight"
            style={{ color: "hsl(43 55% 52%)" }}
          >
            <img src={logoUrl} alt="GoldenMoose" className="h-8 w-8 object-contain" />
            <span>GoldenMoose</span>
          </div>
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <Button
                onClick={handleGoToDashboard}
                className="gap-2"
                style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
              >
                Open Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={handleSignIn} className="text-muted-foreground hover:text-foreground">
                  Sign In
                </Button>
                <Button
                  onClick={handleGetStarted}
                  style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
                >
                  Get Started Free
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
        <Badge
          className="mb-6 border px-4 py-1 text-sm font-medium"
          style={{
            borderColor: "hsl(43 40% 32%)",
            backgroundColor: "hsl(43 55% 52% / 0.1)",
            color: "hsl(43 55% 52%)",
          }}
        >
          AI-Powered Trading, Automated
        </Badge>

        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          Let AI Trade While{" "}
          <span style={{ color: "hsl(43 55% 52%)" }}>You Live Your Life</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          GoldenMoose connects to your broker, runs Claude-powered strategies, and executes
          trades automatically — with built-in guardrails to protect your capital every step
          of the way.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            size="lg"
            onClick={handleGetStarted}
            className="gap-2 px-8 text-base font-semibold"
            style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
          >
            {isSignedIn ? "Open Dashboard" : "Start for Free"}
            <ArrowRight className="h-5 w-5" />
          </Button>
          {!isSignedIn && (
            <Button
              size="lg"
              variant="outline"
              onClick={handleSignIn}
              className="gap-2 px-8 text-base"
              style={{ borderColor: "hsl(43 40% 32%)", color: "hsl(40 10% 93%)" }}
            >
              Sign In
            </Button>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> No trading experience needed
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Free to get started
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Cancel any time
          </span>
        </div>
      </section>

      {/* Video */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div
          className="relative overflow-hidden rounded-2xl border"
          style={{ borderColor: "hsl(43 40% 32%)", backgroundColor: "hsl(0 0% 14%)" }}
        >
          {YOUTUBE_EMBED_URL ? (
            <div className="aspect-video w-full">
              <iframe
                src={YOUTUBE_EMBED_URL}
                title="GoldenMoose walkthrough"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: "hsl(43 55% 52% / 0.15)", border: "2px solid hsl(43 55% 52%)" }}
              >
                <Play className="h-7 w-7 translate-x-0.5" style={{ color: "hsl(43 55% 52%)" }} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">See GoldenMoose in Action</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Watch how the bot connects, configures, and trades automatically
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section
        className="border-y py-24"
        style={{ borderColor: "hsl(43 40% 32% / 0.3)", backgroundColor: "hsl(0 0% 11%)" }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">How It Works</h2>
            <p className="mt-3 text-muted-foreground">
              Three steps from sign-up to automated trading
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div
                  className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "hsl(43 55% 52% / 0.12)" }}
                >
                  <step.icon className="h-6 w-6" style={{ color: "hsl(43 55% 52%)" }} />
                </div>
                <div
                  className="absolute right-0 top-0 font-bold text-4xl opacity-10"
                  style={{ color: "hsl(43 55% 52%)" }}
                >
                  {step.number}
                </div>
                <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Everything You Need to Trade Smarter</h2>
          <p className="mt-3 text-muted-foreground">
            Built for traders who want the edge of AI without the complexity
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border p-6 transition-colors hover:border-[hsl(43_40%_32%)]"
              style={{ borderColor: "hsl(0 0% 20%)", backgroundColor: "hsl(0 0% 13%)" }}
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: "hsl(43 55% 52% / 0.12)" }}
              >
                <f.icon className="h-5 w-5" style={{ color: "hsl(43 55% 52%)" }} />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        className="border-y py-24"
        style={{ borderColor: "hsl(43 40% 32% / 0.3)", backgroundColor: "hsl(0 0% 11%)" }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Simple, Transparent Pricing</h2>
            <p className="mt-3 text-muted-foreground">
              Start free, upgrade when you're ready for the full power of AI
            </p>
          </div>
          <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
            {/* Free */}
            <div
              className="rounded-2xl border p-8"
              style={{ borderColor: "hsl(0 0% 20%)", backgroundColor: "hsl(0 0% 13%)" }}
            >
              <h3 className="text-xl font-bold">Free</h3>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-bold">$0</span>
                <span className="mb-1 text-muted-foreground">/month</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Build and backtest your own custom strategies with full access to the dashboard.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Custom strategy builder",
                  "Broker connections",
                  "Trade history & reports",
                  "Open positions tracking",
                  "Talk to Moose (AI chat)",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-8 w-full"
                variant="outline"
                onClick={handleGetStarted}
                style={{ borderColor: "hsl(43 40% 32%)", color: "hsl(40 10% 93%)" }}
              >
                Get Started Free
              </Button>
            </div>

            {/* Golden Moose */}
            <div
              className="relative rounded-2xl border-2 p-8"
              style={{ borderColor: "hsl(43 55% 52%)", backgroundColor: "hsl(0 0% 13%)" }}
            >
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider"
                style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
              >
                Most Popular
              </div>
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5" style={{ color: "hsl(43 55% 52%)" }} />
                <h3 className="text-xl font-bold">Golden Moose</h3>
              </div>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-bold">$10</span>
                <span className="mb-1 text-muted-foreground">/month</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Unlock the flagship AI strategy powered by Claude — built for serious traders.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {["Everything in Free", ...goldenMoosePerks].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0"
                      style={{ color: "hsl(43 55% 52%)" }}
                    />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-8 w-full font-semibold"
                onClick={handleGetStarted}
                style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
              >
                Unlock Golden Moose
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold md:text-4xl">
          Ready to put your trading on autopilot?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Join traders using GoldenMoose to run AI-driven strategies 24/7 — no manual trading,
          no second-guessing, no missed signals.
        </p>
        <Button
          size="lg"
          className="mt-8 gap-2 px-10 text-base font-semibold"
          onClick={handleGetStarted}
          style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
        >
          {isSignedIn ? "Open Dashboard" : "Create Your Free Account"}
          <ArrowRight className="h-5 w-5" />
        </Button>
      </section>

      {/* Footer */}
      <footer
        className="border-t px-6 py-8 text-center text-sm text-muted-foreground"
        style={{ borderColor: "hsl(43 40% 32% / 0.3)" }}
      >
        <div className="flex items-center justify-center gap-2 font-semibold" style={{ color: "hsl(43 55% 52%)" }}>
          <img src={logoUrl} alt="GoldenMoose" className="h-5 w-5 object-contain" />
          GoldenMoose
        </div>
        <p className="mt-2">© {new Date().getFullYear()} GoldenMoose. All rights reserved.</p>
        <p className="mt-1 text-xs opacity-60">
          Trading involves risk. Past performance is not indicative of future results.
        </p>
      </footer>
    </div>
  );
}
