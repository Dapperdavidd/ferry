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

import type {
  AuthContextType,
  AuthStatus,
  CreateAccountOptions,
  SignInOptions,
} from "@/types/Auth";
import {
  createPasskey,
  loadAccount,
  PasskeyFailure,
  saveAccount,
  signInWithPasskey,
  withSigner,
  type StoredAccount,
} from "@/lib/mera";
import {
  apiClient,
  apiErrorMessage,
  apiErrorStatus,
  type User,
} from "@/utils/apiClient";
import { AuthStorage } from "@/utils/storage/authStorage";
import { isJwtExpired } from "@/utils/jwt";
import { AppError, ErrorCode } from "@/utils/errors";
import { SEED_ADDRESS, SEED_DEMO, SEED_USER } from "@/utils/devSeed";
import { forgetThisDevice } from "@/utils/pushDevice";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

function authFailureMessage(error: unknown): string {
  if (error instanceof PasskeyFailure || error instanceof AppError) {
    return error.message;
  }
  return (
    apiErrorMessage(error) ??
    "Sign in didn't finish. Check your connection and try again."
  );
}

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
      try {
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

        const [stored, token, cachedUser] = await Promise.all([
          loadAccount().catch(() => null),
          AuthStorage.getToken().catch(() => null),
          AuthStorage.getUser().catch(() => null),
        ]);
        if (cancelled) return;
        setAccount(stored);

        if (!stored || !token || isJwtExpired(token)) {
          if (token) await AuthStorage.clearAuthData().catch(() => {});
          if (!cancelled) setStatus("signedOut");
          return;
        }

        if (cachedUser) {
          setUserState(cachedUser);
          setStatus("signedIn");
        }

        try {
          const fresh = await apiClient.getMe();
          if (cancelled) return;
          setUserState(fresh);
          setStatus("signedIn");
          setAuthError(null);
          void AuthStorage.saveUserData(fresh);
        } catch (error) {
          if (cancelled) return;
          if (apiErrorStatus(error) === 401) {
            await AuthStorage.clearAuthData().catch(() => {});
            setUserState(null);
            setStatus("signedOut");
            setAuthError("Your session expired. Unlock with Face ID again.");
          } else if (!cachedUser) {
            setUserState(null);
            setStatus("signedOut");
            setAuthError(authFailureMessage(error));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setUserState(null);
          setStatus("signedOut");
          setAuthError(authFailureMessage(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback(
    (next: User) => {
      setUserState(next);
      void AuthStorage.saveUserData(next);
      if (account) {
        const updated = {
          ...account,
          handle: next.handle ?? undefined,
        };
        setAccount(updated);
        void saveAccount(updated);
      }
    },
    [account]
  );

  /** Derives the account from one PRF output, proves it to the API, and opens the session. */
  const openSession = useCallback(
    (
      prfOutput: Uint8Array,
      credentialId: string,
      intent: "create" | "signIn",
      expectAddress?: Address
    ) =>
      withSigner(prfOutput, async (signer) => {
        if (expectAddress && !sameAddress(signer.address, expectAddress)) {
          throw new AppError(ErrorCode.PASSKEY_MISMATCH, false, false);
        }
        if (intent === "create") {
          // Remember the credential before the network request. If Railway is
          // unavailable after a successful passkey ceremony, the next tap
          // resumes registration instead of creating an orphaned passkey.
          const pending: StoredAccount = {
            address: signer.address,
            credentialId,
            registrationPending: true,
          };
          await saveAccount(pending);
          setAccount(pending);
        }

        const challenge = await apiClient.challenge(signer.address);
        const signature = await signer.signMessage({
          message: challenge.message,
        });
        const verified = await apiClient.verify({
          address: signer.address,
          signature,
          intent,
        });
        // Older API deployments ignored intent and created a user here. Do
        // not silently turn an explicit sign-in into a second account.
        if (intent === "signIn" && verified.isNew) {
          throw new AppError(ErrorCode.PASSKEY_ACCOUNT_NOT_FOUND, false, false);
        }
        await AuthStorage.saveToken(verified.token);
        await AuthStorage.saveUserData(verified.user);
        const next: StoredAccount = {
          address: signer.address,
          credentialId,
          handle: verified.user.handle ?? undefined,
          registrationPending: false,
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
      setAuthError(null);
      try {
        return await work();
      } catch (error) {
        if (error instanceof PasskeyFailure && error.kind === "cancelled") {
          setAuthError(null);
        } else {
          setAuthError(authFailureMessage(error));
        }
        throw error;
      } finally {
        busy.current = false;
      }
    },
    []
  );

  const createAccount = useCallback(
    (options?: CreateAccountOptions) =>
      guarded(async () => {
        await apiClient.health();
        if (options?.resumePending && account?.registrationPending) {
          const asserted = await signInWithPasskey({
            credentialId: account.credentialId,
          });
          await openSession(
            asserted.prfOutput,
            asserted.credentialId,
            "create",
            account.address
          );
          return;
        }
        const created = await createPasskey("Ferry");
        await openSession(created.prfOutput, created.credentialId, "create");
      }),
    [account, guarded, openSession]
  );

  const signIn = useCallback(
    (options?: SignInOptions) =>
      guarded(async () => {
        await apiClient.health();
        const rememberedAccount =
          options?.useRememberedAccount !== false ? account : null;
        const asserted = await signInWithPasskey(
          rememberedAccount
            ? { credentialId: rememberedAccount.credentialId }
            : undefined
        );
        const verified = await openSession(
          asserted.prfOutput,
          asserted.credentialId,
          "signIn",
          rememberedAccount?.address
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
