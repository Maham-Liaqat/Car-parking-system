// Determine API base URL
// - Development: defaults to http://localhost:4000 (Express backend)
// - Production: MUST be provided via VITE_API_BASE_URL (external backend)
const isProd = import.meta.env.PROD;
const envBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
const API_BASE: string | null = envBase || (isProd ? null : "http://localhost:4000");

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    carpark?: {
      id: number;
      name: string;
      location?: string;
      capacity: number;
    } | null;
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getAuthToken(): string | null {
  return window.localStorage.getItem("authToken");
}

export function setAuthToken(token: string | null) {
  if (!token) {
    window.localStorage.removeItem("authToken");
  } else {
    window.localStorage.setItem("authToken", token);
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_BASE) {
    // Fail fast with actionable message in production when API base is not configured
    throw new ApiError(
      500,
      "API base URL is not configured. Set VITE_API_BASE_URL to your backend URL in the environment."
    );
  }

  const token = getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const data = await res.json() as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(data.token);
  window.localStorage.setItem("authUser", JSON.stringify(data.user));
  return data;
}

export function logout() {
  setAuthToken(null);
  window.localStorage.removeItem("authUser");
}

