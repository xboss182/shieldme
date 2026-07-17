import assert from "node:assert/strict";
import test from "node:test";
import { initializeAuth } from "../extension/lib/initialize-auth.ts";
import type { AuthState } from "../extension/lib/storage.ts";

const initialAuth: AuthState = {
  accessToken: "A1",
  refreshToken: "R1",
  email: "user@example.com",
};

test("persists rotated refresh tokens across popup initialization", async () => {
  let stored: AuthState | null = initialAuth;
  const refreshTokensSeen: string[] = [];
  const dependencies = {
    getAuth: async () => stored,
    saveAuth: async (auth: AuthState) => {
      stored = auth;
    },
    clearAuth: async () => {
      stored = null;
    },
    refreshTokens: async (refreshToken: string) => {
      refreshTokensSeen.push(refreshToken);
      return refreshToken === "R1"
        ? { accessToken: "A2", refreshToken: "R2" }
        : { accessToken: "A3", refreshToken: "R3" };
    },
  };

  const first = await initializeAuth(dependencies);
  assert.equal(first?.refreshToken, "R2");
  assert.equal(stored?.refreshToken, "R2");

  const second = await initializeAuth(dependencies);
  assert.equal(second?.refreshToken, "R3");
  assert.deepEqual(refreshTokensSeen, ["R1", "R2"]);
});

test("clears stored auth when refresh fails", async () => {
  let stored: AuthState | null = initialAuth;
  let cleared = false;

  const initialized = await initializeAuth({
    getAuth: async () => stored,
    saveAuth: async (auth: AuthState) => {
      stored = auth;
    },
    clearAuth: async () => {
      cleared = true;
      stored = null;
    },
    refreshTokens: async () => {
      throw new Error("invalid refresh token");
    },
  });

  assert.equal(initialized, null);
  assert.equal(cleared, true);
  assert.equal(stored, null);
});
