import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Car,
  BarChart3,
  LogOut,
  ChevronLeft,
  Menu,
} from "lucide-react";
import { logout } from "@/lib/api";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Customers", icon: Users, path: "/dashboard/customers" },
  { label: "Parking Sessions", icon: Car, path: "/dashboard/parking-sessions" },
  { label: "Reports", icon: BarChart3, path: "/dashboard/reports" },
];

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen flex flex-col transition-all duration-300 ${
          collapsed ? "w-[68px]" : "w-[var(--sidebar-width)]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          background: "hsl(var(--sidebar-bg))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 px-4 ${collapsed ? "justify-center" : "gap-3"}`}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(220 70% 55%), hsl(220 70% 45%))" }}
          >
            <Car className="w-4 h-4" style={{ color: "hsl(0 0% 100%)" }} />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold truncate" style={{ color: "hsl(var(--sidebar-fg-active))" }}>
              Kerikeri Carpark
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`sidebar-item ${isActive ? "sidebar-item-active" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="sidebar-item w-full hidden md:flex"
          >
            <ChevronLeft
              className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 ${
                collapsed ? "rotate-180" : ""
              }`}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={() => {
              logout();
              setMobileOpen(false);
              navigate("/");
            }}
            className="sidebar-item w-full"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="h-14 flex items-center px-4 border-b border-border md:hidden">
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <span className="ml-3 text-sm font-semibold text-foreground">Kerikeri Car Storage</span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
