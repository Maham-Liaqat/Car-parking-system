import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, LogOut as CheckOutIcon } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { validateCustomerForm } from "@/lib/schemas";
import { useCustomerForm } from "@/hooks/useCustomerForm";
import { useCustomerTypes } from "@/hooks/useCustomerTypes";

interface Customer {
  id: number;
  name: string;
  email: string;
  plate: string;
  phone: string;
  type: string;
  balance: string;
  status: string;
}

interface ActiveSession {
  id: number;
  customer: string;
  plate: string;
  entry: string;
  status: "Parked";
}

interface CompletedSession {
  id: number;
  customer: string;
  plate: string;
  entry: string;
  exit: string;
  duration: string;
  fee: string;
  payment: string;
}

const paymentBadge = (payment: string) => {
  if (payment === "paid") return { background: "hsl(var(--success) / 0.1)", color: "hsl(var(--success))" };
  return { background: "hsl(220 13% 91%)", color: "hsl(220 10% 46%)" };
};

const ParkingSessions = () => {
  const [search, setSearch] = useState("");
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { customerTypes } = useCustomerTypes();
  const { formData, setName, setPlate, setPhone, setType, reset } = useCustomerForm(customerTypes[0]);
  const queryClient = useQueryClient();

  const { data: sessionData, isLoading } = useQuery<{ active: ActiveSession[]; completed: CompletedSession[] }>({
    queryKey: ["sessions"],
    queryFn: () => apiFetch("/api/sessions"),
  });

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => apiFetch<Customer[]>("/api/customers"),
  });

  const activeSessions = useMemo(
    () => sessionData?.active || [],
    [sessionData?.active]
  );
  const completedSessions = useMemo(
    () => sessionData?.completed || [],
    [sessionData?.completed]
  );

  // Filter sessions for display
  const filteredActive = useMemo(() => {
    const q = search.toLowerCase();
    return activeSessions.filter(
      (s) => s.customer.toLowerCase().includes(q) || s.plate.toLowerCase().includes(q)
    );
  }, [search, activeSessions]);

  const filteredCompleted = useMemo(() => {
    const q = search.toLowerCase();
    return completedSessions.filter(
      (s) => s.customer.toLowerCase().includes(q) || s.plate.toLowerCase().includes(q)
    );
  }, [search, completedSessions]);

  // Search customers by name, phone, or plate
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.plate.toLowerCase().includes(q)
    );
  }, [searchQuery, allCustomers]);

  const checkInMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      return apiFetch<ActiveSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          plate: customer.plate,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Parking session created.");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setShowCheckInModal(false);
      setSearchQuery("");
      setSelectedCustomer(null);
    },
    onError: (err: Error) => {
      const message = err instanceof ApiError ? err.message : "Failed to create session.";
      toast.error(message);
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const validation = validateCustomerForm({
        name: formData.name,
        email: `${formData.name.toLowerCase().replace(/\s+/g, '.')}@temp.local`,
        plate: formData.plate,
        phone: formData.phone,
        type: formData.type,
      });

      if (!validation.isValid) {
        const errors = Object.entries(validation.errors);
        if (errors.length > 0) {
          throw new Error(errors[0][1]?.[0] || "Please check your input");
        }
      }

      const payload = {
        name: formData.name,
        email: `${formData.name.toLowerCase().replace(/\s+/g, '.')}@temp.local`,
        phone: formData.phone || undefined,
        license_plate: formData.plate,
        customer_type_name: formData.type,
      };
      return apiFetch<Customer>("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (newCustomer) => {
      toast.success("Customer created. Checking in...");
      // Auto check-in the newly created customer
      checkInMutation.mutate(newCustomer);
      // Reset form
      reset();
      setShowCreateForm(false);
      // Refresh customers list
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: Error) => {
      const message = err instanceof ApiError ? err.message : "Failed to create customer.";
      toast.error(message);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiFetch<CompletedSession>(`/api/sessions/${id}/checkout`, {
        method: "POST",
        body: JSON.stringify({ payment_method: "ON_ACCOUNT" }),
      });
    },
    onSuccess: () => {
      toast.success("Customer checked out.");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: Error) => {
      const message = err instanceof ApiError ? err.message : "Failed to check out.";
      toast.error(message);
    },
  });

  const handleCheckOut = (id: number) => {
    checkoutMutation.mutate(id);
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchQuery("");
  };

  const handleCheckIn = () => {
    if (!selectedCustomer) return;
    checkInMutation.mutate(selectedCustomer);
  };

  const handleOpenModal = () => {
    setShowCheckInModal(true);
    setSelectedCustomer(null);
    setSearchQuery("");
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="section-title text-xl sm:text-[28px]">Parking Sessions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading
                ? "Loading sessions..."
                : `${activeSessions.length} active · ${completedSessions.length} completed today`}
            </p>
          </div>
          <button
            onClick={handleOpenModal}
            className="h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground flex items-center justify-center gap-2 btn-hover w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Check In
          </button>
        
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search sessions..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 rounded-lg pl-9 pr-4 text-sm bg-card border border-border outline-none transition-all focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground" />
        </div>

        {/* Active Sessions */}
        <div>
          <h2 className="subsection-title mb-3">Active ({filteredActive.length})</h2>

          {filteredActive.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No active sessions found.</p>
          )}

          {/* Mobile Cards */}
          <div className="block sm:hidden space-y-3">
            {filteredActive.map((s) => (
              <div key={s.id} className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">{s.customer}</p>
                  <span className="badge-active">{s.status}</span>
                </div>
                <div className="flex gap-4 text-sm mb-3">
                  <div><span className="text-xs text-muted-foreground">Plate</span><p className="font-mono text-muted-foreground">{s.plate}</p></div>
                  <div><span className="text-xs text-muted-foreground">Entry</span><p className="text-foreground">{s.entry}</p></div>
                </div>
                <button
                  onClick={() => handleCheckOut(s.id)}
                  className="w-full inline-flex items-center justify-center gap-2 h-8 px-3 rounded-lg text-sm font-medium border border-border bg-card hover:bg-accent transition-colors text-foreground"
                >
                  <CheckOutIcon className="w-3.5 h-3.5" /> Check Out
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          {filteredActive.length > 0 && (
            <div className="hidden sm:block bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Customer</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Plate</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Entry</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Status</th>
                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActive.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 table-row-hover">
                      <td className="px-6 py-3.5 text-sm font-medium text-foreground">{s.customer}</td>
                      <td className="px-4 py-3.5 text-sm font-mono text-muted-foreground">{s.plate}</td>
                      <td className="px-4 py-3.5 text-sm text-foreground">{s.entry}</td>
                      <td className="px-4 py-3.5"><span className="badge-active">{s.status}</span></td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => handleCheckOut(s.id)}
                          className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-sm font-medium border border-border bg-card hover:bg-accent transition-colors text-foreground"
                        >
                          <CheckOutIcon className="w-3.5 h-3.5" /> Check Out
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Completed Sessions */}
        <div>
          <h2 className="subsection-title mb-3">Completed ({filteredCompleted.length})</h2>

          {filteredCompleted.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No completed sessions found.</p>
          )}

          {/* Mobile Cards */}
          <div className="block sm:hidden space-y-3">
            {filteredCompleted.map((s) => (
              <div key={s.id} className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{s.customer}</p>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={paymentBadge(s.payment)}>{s.payment}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-xs text-muted-foreground">Plate</span><p className="font-mono text-muted-foreground">{s.plate}</p></div>
                  <div><span className="text-xs text-muted-foreground">Duration</span><p className="text-foreground">{s.duration}</p></div>
                  <div><span className="text-xs text-muted-foreground">Entry → Exit</span><p className="text-foreground">{s.entry} → {s.exit}</p></div>
                  <div><span className="text-xs text-muted-foreground">Fee</span><p className="font-semibold text-foreground">{s.fee}</p></div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          {filteredCompleted.length > 0 && (
            <div className="hidden sm:block bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Customer</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Plate</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30 hidden lg:table-cell">Entry</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30 hidden lg:table-cell">Exit</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Duration</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Fee</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompleted.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-0 table-row-hover">
                        <td className="px-6 py-3.5 text-sm font-medium text-foreground">{s.customer}</td>
                        <td className="px-4 py-3.5 text-sm font-mono text-muted-foreground">{s.plate}</td>
                        <td className="px-4 py-3.5 text-sm text-foreground hidden lg:table-cell">{s.entry}</td>
                        <td className="px-4 py-3.5 text-sm text-foreground hidden lg:table-cell">{s.exit}</td>
                        <td className="px-4 py-3.5 text-sm text-foreground">{s.duration}</td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-foreground">{s.fee}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={paymentBadge(s.payment)}>{s.payment}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Check-In Modal */}
        <Dialog open={showCheckInModal} onOpenChange={setShowCheckInModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Check In Customer</DialogTitle>
              <DialogDescription>Search by name, phone, or license plate</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {showCreateForm ? (
                <>
                  {/* Create Customer Form */}
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="new-name">Full Name *</Label>
                      <Input
                        id="new-name"
                        placeholder="Enter customer name"
                        value={formData.name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="new-plate">License Plate *</Label>
                      <Input
                        id="new-plate"
                        placeholder="e.g., ABC-123"
                        value={formData.plate}
                        onChange={(e) => setPlate(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="new-phone">Phone</Label>
                      <Input
                        id="new-phone"
                        placeholder="(optional)"
                        value={formData.phone || ""}
                        onChange={(e) => setPhone(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="new-type">Account Type *</Label>
                      <select
                        id="new-type"
                        value={formData.type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full mt-1 h-9 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {customerTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreateForm(false);
                        setSearchQuery("");
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createCustomerMutation.mutate()}
                      disabled={!formData.name.trim() || !formData.plate.trim() || createCustomerMutation.isPending}
                      className="flex-1"
                    >
                      {createCustomerMutation.isPending ? "Creating..." : "Create & Check In"}
                    </Button>
                  </div>
                </>
              ) : !selectedCustomer ? (
                <>
                  {/* Search Input */}
                  <div>
                    <Label htmlFor="customer-search">Search Customer</Label>
                    <Input
                      id="customer-search"
                      placeholder="Name, phone, or plate..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                      className="mt-2"
                    />
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="border border-border rounded-lg max-h-64 overflow-y-auto">
                      {searchResults.map((customer) => (
                        <button
                          key={customer.id}
                          onClick={() => handleSelectCustomer(customer)}
                          className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-accent transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{customer.name}</p>
                              <p className="text-xs text-muted-foreground">{customer.email}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold">{customer.plate}</p>
                              <p className="text-xs text-muted-foreground">{customer.phone}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery && searchResults.length === 0 && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground text-center py-4">No customers found.</p>
                      <Button
                        onClick={() => setShowCreateForm(true)}
                        variant="outline"
                        className="w-full"
                      >
                        Create New Customer
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Customer Details (Auto-filled) */}
                  <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <p className="text-sm font-medium mt-1">{selectedCustomer.name}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">License Plate</Label>
                      <p className="text-sm font-mono font-semibold mt-1">{selectedCustomer.plate}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Account Type</Label>
                      <p className="text-sm font-medium mt-1">{selectedCustomer.type}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Account Balance</Label>
                      <p className="text-sm font-medium mt-1">{selectedCustomer.balance}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setSearchQuery("");
                      }}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleCheckIn}
                      disabled={checkInMutation.isPending}
                      className="flex-1"
                    >
                      {checkInMutation.isPending ? "Checking In..." : "Check In"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ParkingSessions;
