import type { AuthState } from "./storage";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthDependencies {
  getAuth(): Promise<AuthState | null>;
  saveAuth(auth: AuthState): Promise<void>;
  clearAuth(): Promise<void>;
  refreshTokens(refreshToken: string): Promise<AuthTokens>;
}

export async function initializeAuth({
  getAuth,
  saveAuth,
  clearAuth,
  refreshTokens,
}: AuthDependencies): Promise<AuthState | null> {
  const stored = await getAuth();
  if (!stored) return null;

  try {
    const tokens = await refreshTokens(stored.refreshToken);
    const updated = {
      ...stored,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    await saveAuth(updated);
    return updated;
  } catch {
    await clearAuth();
    return null;
  }
}
