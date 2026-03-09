import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { login } from "@/lib/api";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err?.message || "Failed to sign in.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(220 26% 14%) 0%, hsl(220 30% 8%) 50%, hsl(230 25% 12%) 100%)"
      }}
    >
      {/* Subtle glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, hsl(220 70% 50%), transparent 70%)" }}
      />

      <div className="relative w-full max-w-[420px] mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(220 70% 55%), hsl(220 70% 45%))" }}
          >
            <Car className="w-7 h-7" style={{ color: "hsl(0 0% 100%)" }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(0 0% 96%)" }}>
            Kerikeri Car Storage
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "hsl(220 15% 55%)" }}>
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 shadow-2xl border"
          style={{
            background: "hsl(220 26% 12%)",
            borderColor: "hsl(220 20% 18%)"
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "hsl(220 15% 70%)" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-11 rounded-lg px-4 text-sm outline-none transition-all duration-200 border focus:ring-2"
                style={{
                  background: "hsl(220 26% 8%)",
                  borderColor: "hsl(220 20% 20%)",
                  color: "hsl(0 0% 92%)",
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "hsl(220 15% 70%)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 rounded-lg px-4 pr-11 text-sm outline-none transition-all duration-200 border focus:ring-2"
                  style={{
                    background: "hsl(220 26% 8%)",
                    borderColor: "hsl(220 20% 20%)",
                    color: "hsl(0 0% 92%)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "hsl(220 15% 45%)" }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 mt-1" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg text-sm font-semibold transition-all duration-200 btn-hover disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, hsl(220 70% 55%), hsl(220 70% 45%))",
                color: "hsl(0 0% 100%)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "hsl(0 0% 100% / 0.3)", borderTopColor: "hsl(0 0% 100%)" }} />
                  Signing in...
                </span>
              ) : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
