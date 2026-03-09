import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, FileText, ChevronDown, Mail } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { apiFetch, getAuthToken } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ReportSummary {
  period: string;
  typeFilter: string;
  revenueSeries: { label: string; revenue: number }[];
  usage: { label: string; count: number }[];
  summary: {
    customers: number;
    revenueFormatted: string;
    occupancy: string;
  };
}

const Reports = () => {
  const [period, setPeriod] = useState("This Month");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [showPeriod, setShowPeriod] = useState(false);
  const [showType, setShowType] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const periods = ["This Month", "Last Month", "This Quarter", "This Year"];
  const [types, setTypes] = useState<string[]>(["All Types", "Short-Term", "Long-Term", "Annual"]);

  const { data, isLoading, refetch } = useQuery<ReportSummary>({
    queryKey: ["reports-summary", period, typeFilter],
    queryFn: () =>
      apiFetch<ReportSummary>(
        `/api/reports/summary?period=${encodeURIComponent(period)}&type=${encodeURIComponent(
          typeFilter
        )}`
      ),
  });

  useEffect(() => {
    apiFetch<any[]>("/api/customer-types")
      .then((rows) => {
        const names = rows.map((r) => r.name).sort();
        setTypes(["All Types", ...names]);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const revenueData =
    data?.revenueSeries.map((r) => ({ month: r.label, revenue: r.revenue })) || [];
  const usageSummary = data?.usage || [];
  const maxCount = usageSummary.length ? Math.max(...usageSummary.map((u) => u.count)) : 0;
  const stats = data?.summary;
  const totalCustomers = stats?.customers ?? 0;

  interface StatementResult {
    customerId: number;
    name: string;
    email: string;
    amountCents: number;
    status: string;
    error?: string | null;
    sentAt: string;
  }

  interface StatementRunResponse {
    periodStart: string;
    periodEnd: string;
    totalCustomers: number;
    results: StatementResult[];
  }

  const [statementResult, setStatementResult] = useState<StatementRunResponse | null>(null);

  const sendStatements = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/api/dev/run-statement-job`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken() || ""}`,
          },
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to send statements");
      }
      return (await res.json()) as StatementRunResponse;
    },
    onSuccess: (resp) => {
      setStatementResult(resp);
      toast.success("Monthly on-account statements have been processed.");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to send statements.");
    },
  });

  const handleExport = async (format: "CSV" | "PDF") => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/api/reports/export?format=${format.toLowerCase()}&period=${encodeURIComponent(
          period
        )}`,
        {
          headers: {
            Authorization: `Bearer ${window.localStorage.getItem("authToken") || ""}`,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to export report");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${period.replace(/\s+/g, "-").toLowerCase()}.${format.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format} report downloaded for ${period} (${typeFilter}).`);
    } catch (err: any) {
      toast.error(err?.message || `Failed to export ${format} report.`);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="section-title text-xl sm:text-[28px]">Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading reports..." : "Generate and export reports"}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setStatementResult(null);
                setSendOpen(true);
                if (!sendStatements.isPending) {
                  sendStatements.mutate();
                }
              }}
              className="hidden md:flex h-10 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors items-center justify-center gap-2 btn-hover"
            >
              <Mail className="w-4 h-4" />
              Send on-account statements
            </button>
            <button onClick={() => handleExport("CSV")} className="flex-1 sm:flex-none h-10 px-4 rounded-lg text-sm font-medium border border-border bg-card hover:bg-accent transition-colors flex items-center justify-center gap-2 text-foreground btn-hover">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span> CSV
            </button>
            <button onClick={() => handleExport("PDF")} className="flex-1 sm:flex-none h-10 px-4 rounded-lg text-sm font-medium border border-border bg-card hover:bg-accent transition-colors flex items-center justify-center gap-2 text-foreground btn-hover">
              <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Export</span> PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:flex-none">
            <button onClick={() => { setShowPeriod(!showPeriod); setShowType(false); }}
              className="h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border flex items-center gap-2 text-foreground hover:bg-accent transition-colors w-full sm:min-w-[150px] justify-between">
              {period} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showPeriod && (
              <div className="absolute top-full mt-1 left-0 right-0 sm:right-auto z-10 bg-card border border-border rounded-lg shadow-lg py-1 sm:min-w-[150px]">
                {periods.map((p) => (
                  <button key={p} onClick={() => { setPeriod(p); setShowPeriod(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${p === period ? "bg-accent text-foreground font-medium" : "text-foreground hover:bg-accent"}`}>{p}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative flex-1 sm:flex-none">
            <button onClick={() => { setShowType(!showType); setShowPeriod(false); }}
              className="h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border flex items-center gap-2 text-foreground hover:bg-accent transition-colors w-full sm:min-w-[140px] justify-between">
              {typeFilter} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showType && (
              <div className="absolute top-full mt-1 left-0 right-0 sm:right-auto z-10 bg-card border border-border rounded-lg shadow-lg py-1 sm:min-w-[140px]">
                {types.map((t) => (
                  <button key={t} onClick={() => { setTypeFilter(t); setShowType(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${t === typeFilter ? "bg-accent text-foreground font-medium" : "text-foreground hover:bg-accent"}`}>{t}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue Report Chart */}
          <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
            <h3 className="subsection-title mb-4 sm:mb-6">Revenue Report — {period}</h3>
            <div className="h-[220px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 13% 91%)" strokeOpacity={0.5} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 12 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 12 }} dx={-8} width={45} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(220 13% 91%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(220, 70%, 50%)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Customer Usage Summary */}
          <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
            <h3 className="subsection-title mb-4 sm:mb-6">Customer Usage Summary</h3>
            <div className="space-y-5">
              {usageSummary.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    <span className="text-sm font-semibold text-foreground">{item.count} customers</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(item.count / maxCount) * 100}%`, background: "hsl(220, 70%, 50%)" }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Customers</span>
                <span className="font-semibold text-foreground">{totalCustomers}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Revenue (Period)</span>
                <span className="font-semibold text-foreground">
                  {stats?.revenueFormatted ?? "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Occupancy</span>
                <span className="font-semibold text-foreground">
                  {stats?.occupancy ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sending Monthly On-Account Statements modal */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Sending Monthly On-Account Statements</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              We&apos;re emailing statements to all on-account customers with an outstanding
              balance for the current month.
            </p>
            {!statementResult && (
              <div className="flex items-center justify-center py-6">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">Sending statements…</span>
                </div>
              </div>
            )}
            {statementResult && (
              <>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {new Date(statementResult.periodStart).toLocaleDateString()} –{" "}
                    {new Date(statementResult.periodEnd).toLocaleDateString()}
                  </div>
                  <div className="max-h-64 overflow-auto divide-y divide-border">
                    {statementResult.results.length === 0 && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        No on-account customers have an outstanding balance for this period.
                      </div>
                    )}
                    {statementResult.results.map((r) => (
                      <div key={r.customerId} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {r.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-foreground">
                            ${(r.amountCents / 100).toFixed(2)}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              r.status === "SENT"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {r.status === "SENT" ? "Sent" : "Failed"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {statementResult.results.filter((r) => r.status === "SENT").length} of{" "}
                    {statementResult.results.length} statements sent
                  </span>
                  <span>
                    Run completed at{" "}
                    {new Date(
                      statementResult.results[0]?.sentAt || new Date().toISOString()
                    ).toLocaleTimeString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Reports;
