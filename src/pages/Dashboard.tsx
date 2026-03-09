import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import StatsCards from "@/components/StatsCards";
import DashboardCharts from "@/components/DashboardCharts";
import { apiFetch } from "@/lib/api";

interface DashboardSummary {
  revenueToday: number;
  usageByType: { type: string; count: number }[];
  occupancy: { capacity: number; active: number; rate: number };
  parked: { customer: string; plate: string; entry: string; status: string }[];
}

const Dashboard = () => {
  const today = new Date().toLocaleDateString("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiFetch<DashboardSummary>("/api/dashboard/summary"),
  });

  const parkedCars = summary?.parked || [];

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto space-y-6 sm:space-y-8">
        <div>
          <h1 className="section-title text-xl sm:text-[28px]">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Kerikeri Car Storage — {today}</p>
        </div>

        <StatsCards summary={summary} loading={isLoading} />
        <DashboardCharts />

        {/* Currently Parked - Mobile Cards */}
        <div className="block sm:hidden space-y-3">
          <h3 className="subsection-title">Currently Parked ({parkedCars.length} cars)</h3>
          {parkedCars.map((car) => (
            <div key={car.plate} className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{car.customer}</p>
                <span className="badge-active">{car.status}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Plate</span>
                  <p className="font-mono text-muted-foreground">{car.plate}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Entry</span>
                  <p className="text-foreground">{car.entry}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Currently Parked - Desktop Table */}
        <div className="hidden sm:block bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 pb-4">
            <h3 className="subsection-title">Currently Parked ({parkedCars.length} cars)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Customer</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Plate</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Entry Time</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3 bg-muted/30">Status</th>
                </tr>
              </thead>
              <tbody>
                {parkedCars.map((car) => (
                  <tr key={car.plate} className="border-b border-border last:border-0 table-row-hover">
                    <td className="px-6 py-3 text-sm font-medium text-foreground">{car.customer}</td>
                    <td className="px-6 py-3 text-sm text-muted-foreground font-mono">{car.plate}</td>
                    <td className="px-6 py-3 text-sm text-foreground">{car.entry}</td>
                    <td className="px-6 py-3"><span className="badge-active">{car.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
