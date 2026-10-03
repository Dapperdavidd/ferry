import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "@/contexts/AuthContext";

const APP_LOCK_DISABLED =
  __DEV__ && process.env.EXPO_PUBLIC_DISABLE_APP_LOCK === "true";

if (APP_LOCK_DISABLED) {
  console.warn(
    "[app-lock] disabled by EXPO_PUBLIC_DISABLE_APP_LOCK; this dev build will not lock"
  );
}

const BACKGROUND_GRACE_PERIOD_MS = 5 * 60 * 1000;

interface AppLockContextType {
  isLocked: boolean;
  isObscured: boolean;
  isAuthenticating: boolean;
  promptReady: boolean;
  authenticate: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

/** Locks a phone that holds an account. The lock is the phone's biometrics, not the passkey. */
export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { status, account } = useAuth();
  const enabled = account !== null;

  const [resolved, setResolved] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isObscured, setIsObscured] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticatingRef = useRef(false);
  const initialised = useRef(false);

  // Decided once at launch: a freshly created account must not lock the user out mid-flow.
  useEffect(() => {
    if (status === "loading" || initialised.current) return;
    initialised.current = true;
    setIsLocked(enabled);
    setResolved(true);
  }, [status, enabled]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (authenticatingRef.current) return false;
    authenticatingRef.current = true;
    setIsAuthenticating(true);
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        setIsLocked(false);
        return true;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Ferry",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      authenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, []);

  const backgroundedAtRef = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (!enabled) return;
      setIsObscured(state !== "active");
      if (authenticatingRef.current) return;
      if (state === "background") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (state === "active" && backgroundedAtRef.current !== null) {
        const backgroundedFor = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (backgroundedFor >= BACKGROUND_GRACE_PERIOD_MS) setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  return (
    <AppLockContext.Provider
      value={{
        isLocked: APP_LOCK_DISABLED ? false : isLocked,
        isObscured: APP_LOCK_DISABLED ? false : isObscured,
        isAuthenticating,
        promptReady: resolved && enabled,
        authenticate,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (context === undefined)
    throw new Error("useAppLock must be used within an AppLockProvider");
  return context;
}
