import { defineStore, acceptHMRUpdate } from "pinia";
import { ref, computed } from "vue";
import type { AuthSession, CharacterIdentity } from "@/types/sso";

const SESSION_STORAGE_KEY = "eve_auth_session";

function saveSessionToStorage(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function loadSessionFromStorage(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.character)
      return null;
    return parsed;
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export const useAuthStore = defineStore("auth", () => {
  // Session-scoped persistence (sessionStorage) keeps login across refresh
  // but clears on browser session close.
  const session = ref<AuthSession | null>(loadSessionFromStorage());

  const isAuthenticated = computed(() => session.value !== null);
  const character = computed<CharacterIdentity | null>(
    () => session.value?.character ?? null
  );
  const accessToken = computed<string | null>(
    () => session.value?.accessToken ?? null
  );

  function setSession(newSession: AuthSession): void {
    session.value = newSession;
    saveSessionToStorage(session.value);
  }

  function updateTokens(
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): void {
    if (session.value === null) return;
    session.value = {
      ...session.value,
      accessToken,
      refreshToken,
      character: { ...session.value.character, expiresAt }
    };
    saveSessionToStorage(session.value);
  }

  function clearSession(): void {
    session.value = null;
    saveSessionToStorage(null);
  }

  return {
    isAuthenticated,
    character,
    accessToken,
    setSession,
    updateTokens,
    clearSession,
    // Expose refresh token getter as a function (not computed) to avoid leaking it reactively
    getRefreshToken: () => session.value?.refreshToken ?? null
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
