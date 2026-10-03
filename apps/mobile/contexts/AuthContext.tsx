import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, LocalAccount } from "viem";

import type { AuthContextType, AuthStatus } from "@/types/Auth";
import {
  createPasskey,
  loadAccount,
  PasskeyFailure,
  saveAccount,
  signInWithPasskey,
  withSigner,
  type StoredAccount,
} from "@/lib/mera";
import { apiClient, type User } from "@/utils/apiClient";
import { AuthStorage } from "@/utils/storage/authStorage";
import { isJwtExpired } from "@/utils/jwt";
import { AppError, ErrorCode } from "@/utils/errors";
import { SEED_ADDRESS, SEED_DEMO, SEED_USER } from "@/utils/devSeed";
import { forgetThisDevice } from "@/utils/pushDevice";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [account, setAccount] = useState<StoredAccount | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (SEED_DEMO) {
        setAccount({
          address: SEED_ADDRESS,
          credentialId: "seed",
          handle: SEED_USER.handle ?? undefined,
        });
        setUserState(SEED_USER);
        setStatus("signedIn");
        return;
      }
      const stored = await loadAccount().catch(() => null);
      const token = await AuthStorage.getToken().catch(() => null);
      if (cancelled) return;
      setAccount(stored);
      if (stored && token && !isJwtExpired(token)) {
        setUserState(await AuthStorage.getUser());
        setStatus("signedIn");
        apiClient
          .getMe()
          .then((fresh) => {
            if (cancelled) return;
            setUserState(fresh);
            void AuthStorage.saveUserData(fresh);
          })
          .catch(() => {});
      } else {
        setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((next: User) => {
    setUserState(next);
    void AuthStorage.saveUserData(next);
    setAccount((current) =>
      current ? { ...current, handle: next.handle ?? undefined } : current
    );
  }, []);

  /** Derives the account from one PRF output, proves it to the API, and opens the session. */
  const openSession = useCallback(
    (prfOutput: Uint8Array, credentialId: string, expectAddress?: Address) =>
      withSigner(prfOutput, async (signer) => {
        if (expectAddress && !sameAddress(signer.address, expectAddress)) {
          throw new AppError(ErrorCode.PASSKEY_MISMATCH, false, false);
        }
        const challenge = await apiClient.challenge(signer.address);
        const signature = await signer.signMessage({
          message: challenge.message,
        });
        const verified = await apiClient.verify({
          address: signer.address,
          signature,
        });
        await AuthStorage.saveToken(verified.token);
        await AuthStorage.saveUserData(verified.user);
        const next: StoredAccount = {
          address: signer.address,
          credentialId,
          handle: verified.user.handle ?? undefined,
        };
        await saveAccount(next);
        setAccount(next);
        setUserState(verified.user);
        setStatus("signedIn");
        setAuthError(null);
        return verified;
      }),
    []
  );

  const guarded = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      if (busy.current) throw new AppError(ErrorCode.AUTH_FAILED, false, false);
      busy.current = true;
      try {
        return await work();
      } catch (error) {
        if (error instanceof PasskeyFailure && error.kind === "cancelled") {
          setAuthError(null);
        } else if (
          error instanceof PasskeyFailure ||
          error instanceof AppError
        ) {
          setAuthError(error.message);
        } else {
          setAuthError("Sign in didn't finish. Try again.");
        }
        throw error;
      } finally {
        busy.current = false;
      }
    },
    []
  );

  const createAccount = useCallback(
    () =>
      guarded(async () => {
        const created = await createPasskey("Ferry");
        await openSession(created.prfOutput, created.credentialId);
      }),
    [guarded, openSession]
  );

  const signIn = useCallback(
    () =>
      guarded(async () => {
        const asserted = await signInWithPasskey(
          account ? { credentialId: account.credentialId } : undefined
        );
        const verified = await openSession(
          asserted.prfOutput,
          asserted.credentialId,
          account?.address
        );
        return { isNew: verified.isNew };
      }),
    [account, guarded, openSession]
  );

  const authorize = useCallback(
    <T,>(work: (signer: LocalAccount) => Promise<T>) =>
      guarded(async () => {
        if (!account)
          throw new AppError(ErrorCode.SESSION_EXPIRED, false, false);
        const asserted = await signInWithPasskey({
          credentialId: account.credentialId,
        });
        return withSigner(asserted.prfOutput, async (signer) => {
          if (!sameAddress(signer.address, account.address)) {
            throw new AppError(ErrorCode.PASSKEY_MISMATCH, false, false);
          }
          return work(signer);
        });
      }),
    [account, guarded]
  );

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await apiClient.getMe();
      setUser(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [setUser]);

  // The passkey stays with the phone's provider, and the account record stays
  // here so the next sign-in pins it. Only the session and its data go.
  const signOut = useCallback(async () => {
    await forgetThisDevice().catch(() => {});
    await apiClient.signOut().catch(() => {});
    await AuthStorage.clearAuthData();
    queryClient.clear();
    setUserState(null);
    setStatus("signedOut");
    setAuthError(null);
    router.replace("/(auth)/login");
  }, [queryClient]);

  const value = useMemo<AuthContextType>(
    () => ({
      status,
      isAuthenticated: status === "loading" ? null : status === "signedIn",
      isLoading: status === "loading",
      account,
      user,
      address: account?.address ?? null,
      authError,
      createAccount,
      signIn,
      signOut,
      authorize,
      refreshUser,
      setUser,
    }),
    [
      status,
      account,
      user,
      authError,
      createAccount,
      signIn,
      signOut,
      authorize,
      refreshUser,
      setUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
