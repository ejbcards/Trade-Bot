import { useState, useEffect } from "react";
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
  Bot,
  LineChart,
  Wallet,
  Eye,
  LayoutDashboard,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import logoUrl from "/logo.png";
import previewDashboard from "/preview-dashboard.jpg";
import previewStrategies from "/preview-strategies.jpg";
import previewChat from "/preview-chat.jpg";

const slides = [
  {
    id: "dashboard",
    label: "Command Center",
    icon: LayoutDashboard,
    image: previewDashboard,
    title: "Your Trading Command Center",
    description:
      "See your full portfolio at a glance — account value, daily P&L, open positions, and a live activity feed showing every move the bot makes in real time.",
  },
  {
    id: "rules",
    label: "Custom Rules",
    icon: SlidersHorizontal,
    image: previewStrategies,
    title: "Build Your Own Strategy",
    description:
      "Define your own buy/sell decision rules, set stop-loss and take-profit guardrails, configure RSI exits, and tune volatility filters — all without writing a single line of code.",
  },
  {
    id: "chat",
    label: "Talk to Moose",
    icon: MessageCircle,
    image: previewChat,
    title: "Ask the Moose Anything",
    description:
      "Get instant answers about your portfolio, positions, and bot activity. The Moose has live market data and knows exactly what the bot is seeing right now.",
  },
];

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
  const [activeSlide, setActiveSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      goToSlide((activeSlide + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [activeSlide]);

  function goToSlide(index: number) {
    if (index === activeSlide) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveSlide(index);
      setIsTransitioning(false);
    }, 200);
  }

  function handleGetStarted() {
    setLocation(isSignedIn ? "/dashboard" : "/sign-up");
  }

  function handleSignIn() {
    setLocation("/sign-in");
  }

  function handleSneakPeak() {
    setLocation("/dashboard");
  }

  const slide = slides[activeSlide];

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
                onClick={handleGetStarted}
                className="gap-2"
                style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
              >
                Open Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={handleSignIn}
                  className="text-muted-foreground hover:text-foreground"
                >
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

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
          <Button
            size="lg"
            variant="ghost"
            onClick={handleSneakPeak}
            className="gap-2 px-8 text-base"
            style={{ color: "hsl(43 55% 52%)" }}
          >
            <Eye className="h-5 w-5" />
            Sneak Peek of the Moose
          </Button>
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

      {/* App Showcase */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-bold">See It in Action</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A real look at how GoldenMoose works — dashboard, strategy builder, and AI chat
          </p>
        </div>

        {/* Tab controls */}
        <div className="mb-4 flex justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goToSlide(i)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                activeSlide === i
                  ? "border-[hsl(43_55%_52%)] text-[hsl(43_55%_52%)] bg-[hsl(43_55%_52%/0.1)]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-[hsl(43_40%_32%)]"
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Screenshot frame */}
        <div
          className="overflow-hidden rounded-2xl border shadow-2xl"
          style={{ borderColor: "hsl(43 40% 32%)" }}
        >
          <div
            className="relative"
            style={{ backgroundColor: "hsl(0 0% 10%)" }}
          >
            {/* Browser chrome bar */}
            <div
              className="flex items-center gap-2 px-4 py-2.5 border-b"
              style={{ borderColor: "hsl(43 40% 32% / 0.4)", backgroundColor: "hsl(0 0% 12%)" }}
            >
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                <div className="h-3 w-3 rounded-full bg-green-500/60" />
              </div>
              <div
                className="mx-auto flex items-center gap-1.5 rounded px-3 py-0.5 text-xs text-muted-foreground"
                style={{ backgroundColor: "hsl(0 0% 18%)" }}
              >
                <span style={{ color: "hsl(43 55% 52%)" }}>🔒</span>
                golden-moose.replit.app
              </div>
            </div>

            {/* Screenshot */}
            <div className="relative aspect-[16/9] overflow-hidden">
              <img
                src={slide.image}
                alt={slide.label}
                className={cn(
                  "h-full w-full object-cover object-top transition-opacity duration-200",
                  isTransitioning ? "opacity-0" : "opacity-100"
                )}
              />
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/40">
                <div
                  key={activeSlide}
                  className="h-full"
                  style={{
                    backgroundColor: "hsl(43 55% 52%)",
                    animation: "progress 5s linear forwards",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Caption */}
          <div
            className={cn(
              "px-6 py-4 transition-opacity duration-200",
              isTransitioning ? "opacity-0" : "opacity-100"
            )}
            style={{ backgroundColor: "hsl(0 0% 11%)" }}
          >
            <p className="font-semibold text-foreground">{slide.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{slide.description}</p>
          </div>
        </div>

        {/* Dot indicators */}
        <div className="mt-4 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                activeSlide === i
                  ? "w-6 bg-[hsl(43_55%_52%)]"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              )}
            />
          ))}
        </div>

        {/* CTA below showcase */}
        <div className="mt-6 text-center">
          <Button
            onClick={handleSneakPeak}
            variant="outline"
            className="gap-2"
            style={{ borderColor: "hsl(43 40% 32%)", color: "hsl(43 55% 52%)" }}
          >
            <Eye className="h-4 w-4" />
            Explore the full dashboard yourself
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Progress bar keyframes */}
      <style>{`
        @keyframes progress {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>

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
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            className="gap-2 px-10 text-base font-semibold"
            onClick={handleGetStarted}
            style={{ backgroundColor: "hsl(43 55% 52%)", color: "hsl(0 0% 8%)" }}
          >
            {isSignedIn ? "Open Dashboard" : "Create Your Free Account"}
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={handleSneakPeak}
            className="gap-2 px-8 text-base"
            style={{ color: "hsl(43 55% 52%)" }}
          >
            <Eye className="h-5 w-5" />
            Sneak Peek of the Moose
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="border-t px-6 py-8 text-center text-sm text-muted-foreground"
        style={{ borderColor: "hsl(43 40% 32% / 0.3)" }}
      >
        <div
          className="flex items-center justify-center gap-2 font-semibold"
          style={{ color: "hsl(43 55% 52%)" }}
        >
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
