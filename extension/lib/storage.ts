export interface AuthState {
  accessToken: string;
  refreshToken: string;
  email: string;
}

export const authStorage = storage.defineItem<AuthState | null>('local:auth', {
  defaultValue: null,
});

export async function getAuth(): Promise<AuthState | null> {
  return authStorage.getValue();
}

export async function setAuth(auth: AuthState): Promise<void> {
  await authStorage.setValue(auth);
}

export async function clearAuth(): Promise<void> {
  await authStorage.setValue(null);
}
