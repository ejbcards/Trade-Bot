import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListBrokers, useCreateBroker, useUpdateBroker, useDeleteBroker, useTestBrokerConnection } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, Plus, Trash2, Edit2, CheckCircle2, XCircle, RefreshCcw } from "lucide-react";

export default function Brokers() {
  const queryClient = useQueryClient();
  const { data: brokers, isLoading } = useListBrokers();
  
  const createBroker = useCreateBroker();
  const updateBroker = useUpdateBroker();
  const deleteBroker = useDeleteBroker();
  const testConnection = useTestBrokerConnection();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", brokerType: "schwab", apiKey: "", apiSecret: "", isActive: true });

  const handleAdd = () => {
    createBroker.mutate(
      { data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          toast.success("Broker added successfully");
          setIsAddOpen(false);
          setFormData({ name: "", brokerType: "schwab", apiKey: "", apiSecret: "", isActive: true });
        },
        onError: (err: any) => toast.error("Failed to add broker", { description: err.message })
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
        onError: (err: any) => toast.error("Test failed", { description: err.message })
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to remove this broker connection?")) return;
    deleteBroker.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
          toast.success("Broker removed");
        },
        onError: (err: any) => toast.error("Failed to remove broker", { description: err.message })
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Broker Connections</h1>
            <p className="text-muted-foreground mt-1">Manage your exchange integrations and API keys.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Broker Connection</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Connection Name</Label>
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="e.g., Main Schwab Account" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Broker Type</Label>
                  <Select value={formData.brokerType} onValueChange={v => setFormData({...formData, brokerType: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="schwab">Charles Schwab</SelectItem>
                      <SelectItem value="robinhood">Robinhood</SelectItem>
                      <SelectItem value="alpaca">Alpaca</SelectItem>
                      <SelectItem value="interactive_brokers">Interactive Brokers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input 
                    type="password"
                    value={formData.apiKey} 
                    onChange={e => setFormData({...formData, apiKey: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Secret</Label>
                  <Input 
                    type="password"
                    value={formData.apiSecret} 
                    onChange={e => setFormData({...formData, apiSecret: e.target.value})} 
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Label>Enable Connection Immediately</Label>
                  <Switch 
                    checked={formData.isActive} 
                    onCheckedChange={c => setFormData({...formData, isActive: c})} 
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={!formData.name || !formData.apiKey || createBroker.isPending}>
                  {createBroker.isPending ? "Adding..." : "Add Connection"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : brokers && brokers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {brokers.map(broker => (
              <Card key={broker.id} className={!broker.isActive ? "opacity-70" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{broker.name}</CardTitle>
                        <CardDescription className="capitalize">{broker.brokerType.replace('_', ' ')}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={broker.isActive} 
                        onCheckedChange={() => handleToggleActive(broker.id, broker.isActive)} 
                        title="Toggle active status"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Account Value</p>
                      <p className="text-lg font-semibold text-foreground">{formatCurrency(broker.accountValue || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Buying Power</p>
                      <p className="text-lg font-semibold text-foreground">{formatCurrency(broker.buyingPower || 0)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    {broker.status === 'connected' ? (
                      <span className="flex items-center text-emerald-500 font-medium">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Connected
                      </span>
                    ) : broker.status === 'error' ? (
                      <span className="flex items-center text-destructive font-medium">
                        <XCircle className="w-4 h-4 mr-1" /> Error
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Disconnected</span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-0 flex gap-2 border-t mt-4 py-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTest(broker.id)} disabled={testConnection.isPending && testConnection.variables?.id === broker.id}>
                    {testConnection.isPending && testConnection.variables?.id === broker.id ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                    Test
                  </Button>
                  <Button variant="outline" size="sm" className="px-3" disabled>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="px-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(broker.id)} disabled={deleteBroker.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
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
    </AppLayout>
  );
}