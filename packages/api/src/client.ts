const TOKEN_KEY = "jwtToken";
const EXPIRY_KEY = "tokenExpiry";

let baseUrl = "";

/** Set the API base URL (empty string for same-origin) */
export function setBaseUrl(url: string): void {
  baseUrl = url;
}

/** Get the current API base URL */
export function getBaseUrl(): string {
  return baseUrl;
}

// ── Token management ────────────────────────────────────────

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string, expiresInMs: number): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, (Date.now() + expiresInMs).toString());
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (token && expiry) {
    const expiryMs = parseInt(expiry, 10);
    if (!isNaN(expiryMs) && Date.now() < expiryMs) {
      return true;
    }
    clearToken();
  }
  return false;
}

// ── HTTP helpers ────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string
  ) {
    super(message ?? `API error ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...opts, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body, `API ${res.status}: ${path}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function postForm<T>(path: string, formData: FormData): Promise<T> {
  // Don't set Content-Type; browser will set multipart boundary
  return request<T>(path, {
    method: "POST",
    body: formData,
  });
}
