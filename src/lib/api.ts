const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

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

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    (headers as any).Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
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

