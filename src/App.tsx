import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import ParkingSessions from "./pages/ParkingSessions";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import { getAuthToken } from "./lib/api";

const queryClient = new QueryClient();

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const token = getAuthToken();
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/customers"
            element={
              <RequireAuth>
                <Customers />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/parking-sessions"
            element={
              <RequireAuth>
                <ParkingSessions />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/reports"
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
