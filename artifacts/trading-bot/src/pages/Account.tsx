import { useState } from "react";
import { useUser, useClerk, Show } from "@clerk/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Crown,
  Key,
  LogOut,
  User,
  CreditCard,
  ArrowRight,
  CheckCircle2,
  Lock,
  Sparkles,
  LogIn,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchUserAccess(): Promise<{ hasAccess: boolean; grantType: string | null }> {
  const res = await fetch(`${basePath}/api/user/access`);
  if (!res.ok) throw new Error("Failed to check access");
  return res.json() as Promise<{ hasAccess: boolean; grantType: string | null }>;
}

async function redeemKey(key: string): Promise<{ success: boolean; alreadyGranted?: boolean }> {
  const res = await fetch(`${basePath}/api/user/redeem-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to redeem key");
  }
  return res.json() as Promise<{ success: boolean; alreadyGranted?: boolean }>;
}

function SignedOutView() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 px-4">
      <div className="text-center space-y-3 max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Crown className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-foreground">Create Your Account</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Sign up to unlock premium features including the{" "}
          <span className="text-primary font-semibold">Golden Moose Strategy</span> — our flagship
          AI-powered trading algorithm.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg">
        {[
          { icon: Sparkles, label: "AI-Powered", desc: "Claude-backed trading signals" },
          { icon: Crown, label: "Golden Moose", desc: "Premium strategy access" },
          { icon: Key, label: "Access Keys", desc: "Invite-only bypass codes" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4 text-center space-y-1">
            <Icon className="w-5 h-5 text-primary mx-auto" />
            <div className="font-semibold text-sm text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <Button
          className="flex-1 gap-2"
          onClick={() => setLocation("/sign-up")}
        >
          <User className="w-4 h-4" />
          Create Account
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => setLocation("/sign-in")}
        >
          <LogIn className="w-4 h-4" />
          Sign In
        </Button>
      </div>
    </div>
  );
}

function AccountDashboard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [accessKey, setAccessKey] = useState("");

  const { data: accessData, refetch: refetchAccess } = useQuery({
    queryKey: ["user-access"],
    queryFn: fetchUserAccess,
    retry: false,
  });

  const redeemMutation = useMutation({
    mutationFn: redeemKey,
    onSuccess: (data) => {
      if (data.alreadyGranted) {
        toast.info("You already have access to Golden Moose Strategy.");
      } else {
        toast.success("Access granted! Golden Moose Strategy is now unlocked.");
      }
      setAccessKey("");
      void refetchAccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const hasAccess = accessData?.hasAccess ?? false;
  const grantType = accessData?.grantType ?? null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Your Account</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription and access keys.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">
                {user?.fullName ?? user?.username ?? "User"}
              </p>
              <p className="text-sm text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress ?? ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => void signOut({ redirectUrl: `${basePath}/` })}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="w-4 h-4 text-primary" />
            Golden Moose Strategy
            {hasAccess ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 ml-auto">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Unlocked
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">
                <Lock className="w-3 h-3 mr-1" />
                Locked
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Our flagship AI-powered strategy. Uses Claude to analyze market signals, manage risk
            automatically, and execute trades with precision.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAccess ? (
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4 inline mr-2" />
              Access granted via{" "}
              <span className="font-semibold capitalize">{grantType?.replace("_", " ")}</span>.
              The Golden Moose Strategy is active in your Strategies dashboard.
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-card border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">Monthly Subscription</p>
                    <p className="text-sm text-muted-foreground">Full access to Golden Moose Strategy</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">$10</p>
                    <p className="text-xs text-muted-foreground">/month</p>
                  </div>
                </div>
                <Button className="w-full gap-2 mt-2" disabled>
                  <CreditCard className="w-4 h-4" />
                  Subscribe — Coming Soon
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Stripe payments are being set up. Use an access key below in the meantime.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
                <Separator className="flex-1" />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Key className="w-3.5 h-3.5 text-primary" />
                  Access Key
                </Label>
                <p className="text-xs text-muted-foreground">
                  Have an invite code? Enter it below to bypass the paywall.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter your access key…"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && accessKey.trim()) {
                        redeemMutation.mutate(accessKey);
                      }
                    }}
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={() => redeemMutation.mutate(accessKey)}
                    disabled={!accessKey.trim() || redeemMutation.isPending}
                    className="gap-2 shrink-0"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Redeem
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Account() {
  return (
    <AppLayout>
      <Show when="signed-in">
        <AccountDashboard />
      </Show>
      <Show when="signed-out">
        <SignedOutView />
      </Show>
    </AppLayout>
  );
}
