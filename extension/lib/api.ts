const BASE_URL = "https://api.shieldme.cc";

export interface Alias {
  id: string;
  localPart: string;
  domain: string;
  address: string;
  enabled: boolean;
  label?: string;
  createdAt: string;
}

export interface Domain {
  id: string;
  domain: string;
  status: string;
  isShared?: boolean;
}

export interface Recipient {
  id: string;
  email: string;
  status: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error("Session expired");
  return res.json();
}

export async function listAliases(token: string): Promise<Alias[]> {
  const data = await request<{ aliases: Alias[] }>("/api/aliases", token);
  return data.aliases;
}

export async function createAlias(
  token: string,
  localPart: string,
  domainId: string,
  recipientId: string,
): Promise<Alias> {
  return request<Alias>("/api/aliases", token, {
    method: "POST",
    body: JSON.stringify({ localPart, domainId, recipientId }),
  });
}

export async function enableAlias(token: string, id: string): Promise<{ alias: Alias }> {
  return request<{ alias: Alias }>(`/api/aliases/${id}/enable`, token, { method: "POST" });
}

export async function disableAlias(token: string, id: string): Promise<{ alias: Alias }> {
  return request<{ alias: Alias }>(`/api/aliases/${id}/disable`, token, { method: "POST" });
}

export async function listDomains(token: string): Promise<Domain[]> {
  const data = await request<{ domains: Domain[] }>("/api/domains", token);
  return data.domains;
}

export async function listRecipients(token: string): Promise<Recipient[]> {
  const data = await request<{ recipients: Recipient[] }>("/api/recipients", token);
  return data.recipients;
}
