import { TrendingUp, DollarSign, Car, Users } from "lucide-react";

interface DashboardSummary {
  revenueToday: number;
  usageByType: { type: string; count: number }[];
  occupancy: { capacity: number; active: number; rate: number };
}

interface StatsCardsProps {
  summary?: DashboardSummary;
  loading?: boolean;
}

const StatsCards = ({ summary, loading }: StatsCardsProps) => {
  const totalRevenue = summary ? `$${summary.revenueToday.toFixed(2)}` : "—";
  const activeCars = summary ? summary.occupancy.active.toString() : "—";
  const activeCustomers = summary
    ? summary.usageByType.reduce((sum, u) => sum + u.count, 0).toString()
    : "—";
  const avgDailyRevenue = totalRevenue;

  const stats = [
    {
      label: "Total Revenue (Today)",
      value: loading ? "…" : totalRevenue,
      change: "",
      trend: "up" as const,
      icon: DollarSign,
      accentColor: "hsl(220 70% 50%)",
    },
    {
      label: "Cars Parked",
      value: loading ? "…" : activeCars,
      change: summary && summary.occupancy.capacity
        ? `${Math.round(summary.occupancy.rate)}% capacity`
        : "",
      trend: "neutral" as const,
      icon: Car,
      accentColor: "hsl(160 60% 45%)",
    },
    {
      label: "Active Customers",
      value: loading ? "…" : activeCustomers,
      change: "",
      trend: "up" as const,
      icon: Users,
      accentColor: "hsl(38 92% 50%)",
    },
    {
      label: "Avg Daily Revenue",
      value: loading ? "…" : avgDailyRevenue,
      change: "",
      trend: "up" as const,
      icon: TrendingUp,
      accentColor: "hsl(280 65% 60%)",
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="card-stat group">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="min-w-0">
              <p className="stat-label mb-1 sm:mb-2 text-xs sm:text-[14px] truncate">
                {stat.label}
              </p>
              <p className="stat-number text-lg sm:text-[26px]">{stat.value}</p>
            </div>
            <stat.icon
              className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
              style={{ color: stat.accentColor }}
            />
          </div>
          {stat.change && (
            <p
              className="stat-change text-[10px] sm:text-[12px]"
              style={{
                color:
                  stat.trend === "up"
                    ? "hsl(var(--success))"
                    : "hsl(var(--muted-foreground))",
              }}
            >
              {stat.change}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
