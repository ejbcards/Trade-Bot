import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListBrokers, useCreateBroker, useUpdateBroker, useDeleteBroker, useTestBrokerConnection } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, Plus, Trash2, CheckCircle2, XCircle, RefreshCcw, ExternalLink, Wifi, WifiOff, AlertCircle } from "lucide-react";

async function fetchSchwabAuthUrl(): Promise<string | null> {
  const resp = await fetch("/api/schwab/auth-url");
  if (!resp.ok) return null;
  const data = await resp.json() as { authUrl: string };
  return data.authUrl;
}

async function fetchSchwabStatus(): Promise<{ connected: boolean; hasRefreshToken: boolean; hasAccountId: boolean }> {
  const resp = await fetch("/api/schwab/status");
  if (!resp.ok) return { connected: false, hasRefreshToken: false, hasAccountId: false };
  return resp.json();
}

const BROKER_LABELS: Record<string, string> = {
  schwab: "Charles Schwab",
  robinhood: "Robinhood",
  alpaca: "Alpaca",
  interactive_brokers: "Interactive Brokers",
  paper: "Paper Trading",
};

export default function Brokers() {
  const queryClient = useQueryClient();
  const { data: brokers, isLoading } = useListBrokers();

  const createBroker = useCreateBroker();
  const updateBroker = useUpdateBroker();
  const deleteBroker = useDeleteBroker();
  const testConnection = useTestBrokerConnection();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    brokerType: "alpaca",
    apiKey: "",
    apiSecret: "",
    isActive: true,
    alpacaPaper: true,
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [schwabConnecting, setSchwabConnecting] = useState<number | null>(null);
  const [schwabStatus, setSchwabStatus] = useState<Record<number, { hasRefreshToken: boolean }>>({});

  const isAlpaca = formData.brokerType === "alpaca";
  const isSchwabForm = formData.brokerType === "schwab";

  const resetForm = () => setFormData({ name: "", brokerType: "alpaca", apiKey: "", apiSecret: "", isActive: true, alpacaPaper: true });

  const handleAdd = () => {
    const payload = {
      name: formData.name,
      brokerType: formData.brokerType,
      apiKey: formData.apiKey || undefined,
      apiSecret: formData.apiSecret || undefined,
      isActive: formData.isActive,
      // store paper/live mode in accountId before we have a real account number
      ...(isAlpaca ? { accountId: formData.alpacaPaper ? "paper" : "live" } : {}),
    };
    createBroker.mutate(
      { data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          toast.success("Broker added successfully");
          setIsAddOpen(false);
          resetForm();
        },
        onError: (err: unknown) => toast.error("Failed to add broker", { description: (err as Error).message })
      }
    );
  };

  const handleTest = (id: number) => {
    testConnection.mutate(
      { id },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success("Connection successful", { description: res.message });
            queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          } else {
            toast.error("Connection failed", { description: res.message });
          }
        },
        onError: (err: unknown) => toast.error("Test failed", { description: (err as Error).message })
      }
    );
  };

  const handleDelete = (id: number) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmId == null) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    deleteBroker.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          toast.success("Broker removed");
        },
        onError: (err: unknown) => toast.error("Failed to remove broker", { description: (err as Error).message })
      }
    );
  };

  const handleToggleActive = (id: number, currentActive: boolean) => {
    updateBroker.mutate(
      { id, data: { isActive: !currentActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          toast.success(`Broker ${!currentActive ? "enabled" : "disabled"}`);
        }
      }
    );
  };

  const handleConnectSchwabOAuth = async (brokerId: number) => {
    setSchwabConnecting(brokerId);
    try {
      const url = await fetchSchwabAuthUrl();
      if (!url) { toast.error("Could not get Schwab authorization URL"); return; }

      const popup = window.open(url, "_blank", "width=700,height=700,scrollbars=yes");
      const poll = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(poll);
          setSchwabConnecting(null);
          const status = await fetchSchwabStatus();
          setSchwabStatus(prev => ({ ...prev, [brokerId]: status }));
          if (status.hasRefreshToken) {
            toast.success("Schwab connected!", { description: "Live quotes will now stream from Schwab's Market Data API." });
            queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          } else {
            toast.error("Schwab authorization incomplete", { description: "Please try again and complete the authorization in the popup." });
          }
        }
      }, 1000);
    } catch {
      toast.error("Failed to initiate Schwab authorization");
      setSchwabConnecting(null);
    }
  };

  const handleCheckSchwabStatus = async (brokerId: number) => {
    const status = await fetchSchwabStatus();
    setSchwabStatus(prev => ({ ...prev, [brokerId]: status }));
    if (status.hasRefreshToken) {
      toast.success("Schwab OAuth tokens are active — live data streaming from Schwab");
    } else {
      toast.info("No Schwab OAuth tokens yet — click 'Connect with Schwab' to authorize");
    }
  };

  // Derive Alpaca mode from stored accountId ("paper:ACC-xxx" or "live:ACC-xxx" or "paper"/"live")
  const alpacaMode = (accountId: string | null | undefined): "paper" | "live" | null => {
    if (!accountId) return null;
    if (accountId.startsWith("paper")) return "paper";
    if (accountId.startsWith("live")) return "live";
    return null;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Broker Connections</h1>
            <p className="text-muted-foreground mt-1">Manage your exchange integrations and API keys.</p>
          </div>

          <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Broker Connection</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Connection Name</Label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder={isAlpaca ? "e.g., My Alpaca Paper Account" : "e.g., Main Schwab Account"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Broker Type</Label>
                  <Select value={formData.brokerType} onValueChange={v => setFormData({ ...formData, brokerType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alpaca">Alpaca</SelectItem>
                      <SelectItem value="schwab">Charles Schwab</SelectItem>
                      <SelectItem value="robinhood">Robinhood</SelectItem>
                      <SelectItem value="interactive_brokers">Interactive Brokers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Alpaca paper/live toggle */}
                {isAlpaca && (
                  <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Paper Trading</p>
                        <p className="text-xs text-muted-foreground">Uses Alpaca's simulated environment</p>
                      </div>
                      <Switch
                        checked={formData.alpacaPaper}
                        onCheckedChange={c => setFormData({ ...formData, alpacaPaper: c })}
                      />
                    </div>
                    {!formData.alpacaPaper && (
                      <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-md p-2 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>Live trading uses real money. Make sure you understand the risks before enabling.</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Get your API keys from{" "}
                      <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noreferrer" className="underline text-primary">
                        app.alpaca.markets
                      </a>
                    </p>
                  </div>
                )}

                {/* Schwab note */}
                {isSchwabForm && (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 border">
                    After adding, use the <strong>Connect with Schwab</strong> button on the card to complete OAuth authorization for live market data.
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{isAlpaca ? "API Key ID" : "API Key"}</Label>
                  <Input
                    type="password"
                    value={formData.apiKey}
                    onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={isAlpaca ? "PKXXXXX..." : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isAlpaca ? "Secret Key" : "API Secret"}</Label>
                  <Input
                    type="password"
                    value={formData.apiSecret}
                    onChange={e => setFormData({ ...formData, apiSecret: e.target.value })}
                    placeholder={isAlpaca ? "xxxxxxxx..." : ""}
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Label>Enable Connection Immediately</Label>
                  <Switch checked={formData.isActive} onCheckedChange={c => setFormData({ ...formData, isActive: c })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleAdd}
                  disabled={!formData.name || (!isAlpaca && !formData.apiKey) || (isAlpaca && (!formData.apiKey || !formData.apiSecret)) || createBroker.isPending}
                >
                  {createBroker.isPending ? "Adding..." : "Add Connection"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : brokers && brokers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {brokers.map(broker => {
              const isSchwab = broker.brokerType === "schwab";
              const isAlpacaBroker = broker.brokerType === "alpaca";
              const liveStatus = schwabStatus[broker.id];
              const hasOAuth = liveStatus?.hasRefreshToken ?? false;
              const isConnectingThis = schwabConnecting === broker.id;
              const mode = alpacaMode(broker.accountId);
              const accountDisplay = broker.accountId?.includes(":") ? broker.accountId.split(":")[1] : broker.accountId;

              return (
                <Card key={broker.id} className={!broker.isActive ? "opacity-70" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                          <Wallet className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{broker.name}</CardTitle>
                          <CardDescription className="capitalize flex items-center gap-1.5">
                            {BROKER_LABELS[broker.brokerType] ?? broker.brokerType.replace("_", " ")}
                            {isAlpacaBroker && mode && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${mode === "paper" ? "border-blue-500/40 text-blue-400" : "border-amber-500/40 text-amber-400"}`}>
                                {mode === "paper" ? "Paper" : "Live"}
                              </Badge>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={broker.isActive}
                        onCheckedChange={() => handleToggleActive(broker.id, broker.isActive)}
                        title="Toggle active status"
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Account Value</p>
                        <p className="text-lg font-semibold">{broker.accountValue ? formatCurrency(broker.accountValue) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Buying Power</p>
                        <p className="text-lg font-semibold">{broker.buyingPower ? formatCurrency(broker.buyingPower) : "—"}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      {broker.status === "connected" ? (
                        <span className="flex items-center text-emerald-500 font-medium">
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Connected
                          {accountDisplay && accountDisplay !== "paper" && accountDisplay !== "live" && (
                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">{accountDisplay}</span>
                          )}
                        </span>
                      ) : broker.status === "error" ? (
                        <span className="flex items-center text-destructive font-medium">
                          <XCircle className="w-4 h-4 mr-1" /> Error
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Disconnected</span>
                      )}
                    </div>

                    {/* Alpaca info section */}
                    {isAlpacaBroker && (
                      <div className="rounded-lg border p-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-medium">Market Data</span>
                          {broker.status === "connected" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1">
                              <Wifi className="w-3 h-3" /> Alpaca Live
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground gap-1">
                              <WifiOff className="w-3 h-3" /> Offline
                            </Badge>
                          )}
                        </div>
                        {broker.status === "connected" && (
                          <p className="text-xs text-muted-foreground">
                            Real-time bid/ask option quotes stream from Alpaca's Market Data API.
                          </p>
                        )}
                        {broker.status !== "connected" && (
                          <p className="text-xs text-muted-foreground">
                            Click "Test Connection" to verify your API keys and enable live quotes.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Schwab OAuth section */}
                    {isSchwab && (
                      <div className="rounded-lg border p-3 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-medium">Live Market Data</span>
                          {hasOAuth ? (
                            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1">
                              <Wifi className="w-3 h-3" /> Schwab Live
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 gap-1">
                              <WifiOff className="w-3 h-3" /> Not authorized
                            </Badge>
                          )}
                        </div>
                        {!hasOAuth && (
                          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span>Authorize with Schwab to stream real-time bid/ask quotes directly from their Market Data API.</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className={hasOAuth
                              ? "flex-1 bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600/30 border border-emerald-500/30"
                              : "flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                            }
                            onClick={() => handleConnectSchwabOAuth(broker.id)}
                            disabled={isConnectingThis}
                          >
                            {isConnectingThis ? (
                              <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Waiting…</>
                            ) : hasOAuth ? (
                              <><RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Re-authorize</>
                            ) : (
                              <><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Connect with Schwab</>
                            )}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleCheckSchwabStatus(broker.id)} title="Check OAuth status">
                            <RefreshCcw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-0 flex gap-2 border-t mt-2 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleTest(broker.id)}
                      disabled={testConnection.isPending && testConnection.variables?.id === broker.id}
                    >
                      {testConnection.isPending && testConnection.variables?.id === broker.id
                        ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                        : <RefreshCcw className="w-4 h-4 mr-2" />}
                      Test Connection
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(broker.id)}
                      disabled={deleteBroker.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed rounded-xl bg-muted/10">
            <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No Brokers Connected</h3>
            <p className="text-muted-foreground mt-1 mb-6 max-w-md mx-auto">
              Connect a brokerage account to start viewing your portfolio and enabling automated trading.
            </p>
            <Button onClick={() => setIsAddOpen(true)}>Add Your First Connection</Button>
          </div>
        )}
      </div>

      <AlertDialog open={deleteConfirmId != null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove broker connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the broker and all associated trades and positions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
