import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const revenueData = [
  { month: "Oct", revenue: 4000 },
  { month: "Nov", revenue: 5000 },
  { month: "Dec", revenue: 7000 },
  { month: "Jan", revenue: 5500 },
  { month: "Feb", revenue: 5000 },
  { month: "Mar", revenue: 3200 },
];

const customerData = [
  { name: "Short-Term", value: 45, color: "hsl(220, 70%, 50%)" },
  { name: "Long-Term", value: 27, color: "hsl(280, 65%, 55%)" },
  { name: "Annual", value: 12, color: "hsl(160, 60%, 45%)" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-sm font-semibold" style={{ color: "hsl(220 70% 50%)" }}>${payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

const DashboardCharts = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Revenue Trend */}
      <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
        <h3 className="subsection-title mb-4 sm:mb-6">Revenue Trend</h3>
        <div className="h-[220px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 13% 91%)" strokeOpacity={0.5} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 12 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(220 10% 46%)", fontSize: 12 }} dx={-8} width={45} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220 14% 96%)" }} />
              <Bar dataKey="revenue" fill="hsl(220, 70%, 50%)" radius={[6, 6, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Customer Types */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
        <h3 className="subsection-title mb-4 sm:mb-6">Customer Types</h3>
        <div className="h-[160px] sm:h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={customerData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                {customerData.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3 mt-4">
          {customerData.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-foreground">{item.name}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;
