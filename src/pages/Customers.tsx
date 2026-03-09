import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

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

const typeBadgeStyle = (type: string) => {
  switch (type) {
    case "Short-Term":
      return { background: "hsl(220 70% 50% / 0.1)", color: "hsl(220 70% 50%)" };
    case "Long-Term":
      return { background: "hsl(160 60% 45% / 0.1)", color: "hsl(160 60% 40%)" };
    case "Annual":
      return { background: "hsl(220 13% 91%)", color: "hsl(220 20% 30%)" };
    default:
      return { background: "hsl(220 13% 91%)", color: "hsl(220 20% 30%)" };
  }
};

const Customers = () => {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => apiFetch<Customer[]>("/api/customers"),
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [showDropdown, setShowDropdown] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPlate, setFormPlate] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formType, setFormType] = useState("Short-Term");

  const [customerTypes, setCustomerTypes] = useState<string[]>(["Short-Term", "Long-Term", "Annual"]);

  useEffect(() => {
    apiFetch<any[]>("/api/customer-types")
      .then((rows) => {
        const names = rows.map((r) => r.name).sort();
        setCustomerTypes(names);
      })
      .catch(() => {
        // ignore, keep defaults
      });
  }, []);

  const types = ["All Types", ...customerTypes];

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.plate.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "All Types" || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPlate(""); setFormPhone(""); setFormType("Short-Term");
  };

  const openAdd = () => { setEditIndex(null); resetForm(); setDialogOpen(true); };

  const openEdit = (idx: number) => {
    const c = customers[idx];
    setEditIndex(idx); setFormName(c.name); setFormEmail(c.email); setFormPlate(c.plate);
    setFormPhone(c.phone === "—" ? "" : c.phone); setFormType(c.type); setDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiFetch<Customer>("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success("Customer added.");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to add customer.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      return apiFetch<Customer>(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success("Customer updated.");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to update customer.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiFetch(`/api/customers/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Customer removed.");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to delete customer.");
    },
  });

  const handleSave = () => {
    if (!formName.trim() || !formEmail.trim() || !formPlate.trim()) {
      toast.error("Please fill in Name, Email, and Plate fields.");
      return;
    }

    const payload = {
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || undefined,
      license_plate: formPlate.trim().toUpperCase(),
      customer_type_name: formType,
    };

    if (editIndex !== null) {
      const id = customers[editIndex].id;
      updateMutation.mutate({ id, payload });
    } else {
      createMutation.mutate(payload);
    }

    setDialogOpen(false);
    resetForm();
    setEditIndex(null);
  };

  const handleDelete = () => {
    if (deleteIndex === null) return;
    const id = customers[deleteIndex].id;
    deleteMutation.mutate(id);
    setDeleteIndex(null);
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="section-title text-xl sm:text-[28px]">Customers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading customers..." : `${customers.length} total customers`}
            </p>
          </div>
          <Button onClick={openAdd} className="gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name or plate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-lg pl-9 pr-4 text-sm bg-card border border-border outline-none transition-all focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border flex items-center gap-2 text-foreground transition-colors hover:bg-accent w-full sm:w-auto sm:min-w-[140px] justify-between"
            >
              {typeFilter}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showDropdown && (
              <div className="absolute top-full mt-1 right-0 left-0 sm:left-auto z-10 bg-card border border-border rounded-lg shadow-lg py-1 sm:min-w-[140px]">
                {types.map((t) => (
                  <button key={t} onClick={() => { setTypeFilter(t); setShowDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">{t}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filtered.map((c, fi) => {
            const realIndex = customers.findIndex((cu) => cu.id === c.id);
            return (
              <div key={c.plate + realIndex} className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(realIndex)} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Edit">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => setDeleteIndex(realIndex)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Plate</span>
                    <p className="font-mono text-foreground">{c.plate}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Phone</span>
                    <p className="text-foreground">{c.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Balance</span>
                    <p className="font-semibold text-foreground">{c.balance}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium w-fit" style={typeBadgeStyle(c.type)}>{c.type}</span>
                    <span className={`w-fit ${c.status === "active" ? "badge-active" : "badge-expired"}`}>{c.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Name</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Plate</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30 hidden lg:table-cell">Phone</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Type</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Balance</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Status</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, fi) => {
                  const realIndex = customers.findIndex((cu) => cu.id === c.id);
                  return (
                    <tr key={c.plate + realIndex} className="border-b border-border last:border-0 table-row-hover">
                      <td className="px-6 py-3.5">
                        <p className="text-sm font-medium text-foreground leading-tight">{c.name}</p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{c.email}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-mono text-muted-foreground">{c.plate}</td>
                      <td className="px-4 py-3.5 text-sm text-foreground hidden lg:table-cell">{c.phone}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={typeBadgeStyle(c.type)}>{c.type}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-foreground">{c.balance}</td>
                      <td className="px-4 py-3.5">
                        <span className={c.status === "active" ? "badge-active" : "badge-expired"}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(realIndex)} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Edit">
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button onClick={() => setDeleteIndex(realIndex)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editIndex !== null ? "Edit Customer" : "Add New Customer"}</DialogTitle>
            <DialogDescription>{editIndex !== null ? "Update the customer details below." : "Fill in the details to add a new customer."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" placeholder="e.g. John Smith" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" placeholder="e.g. john@email.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plate">License Plate *</Label>
                <Input id="plate" placeholder="e.g. ABC123" value={formPlate} onChange={(e) => setFormPlate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="e.g. 021..." value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Customer Type</Label>
              <select id="type" value={formType} onChange={(e) => setFormType(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {customerTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={handleSave} className="w-full sm:w-auto">{editIndex !== null ? "Save Changes" : "Add Customer"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => { if (!open) setDeleteIndex(null); }}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteIndex !== null ? customers[deleteIndex]?.name : ""}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Customers;
