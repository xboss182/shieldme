const AT = "sm.at";
const RT = "sm.rt";
const USR = "sm.usr";

export type SessionUser = { id: string; email: string; role: string; plan: string };
export type Session = { user: SessionUser; accessToken: string; refreshToken: string };

function storage(): Storage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export function getAccessToken(): string | null {
  return storage()?.getItem(AT) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(RT) ?? null;
}

export function getCachedUser(): SessionUser | null {
  const s = storage();
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(USR) ?? "null") as SessionUser | null;
  } catch {
    return null;
  }
}

export function setSession(session: Session) {
  const s = storage();
  if (!s) return;
  s.setItem(AT, session.accessToken);
  s.setItem(RT, session.refreshToken);
  s.setItem(USR, JSON.stringify(session.user));
}

export function clearSession() {
  const s = storage();
  if (!s) return;
  s.removeItem(AT);
  s.removeItem(RT);
  s.removeItem(USR);
}
