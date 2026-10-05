import type { Address, LocalAccount } from "viem";

import type { StoredAccount } from "@/lib/mera";
import type { User } from "@/utils/apiClient";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export type SignInOptions = {
  /** False opens the passkey chooser instead of pinning this phone's last account. */
  useRememberedAccount?: boolean;
};

export type CreateAccountOptions = {
  /** True resumes a passkey ceremony that succeeded before registration finished. */
  resumePending?: boolean;
};

export interface AuthContextType {
  status: AuthStatus;
  /** Null while loading, for screens that branch on it. */
  isAuthenticated: boolean | null;
  isLoading: boolean;
  /** What this phone remembers: address, passkey id, handle. Survives sign-out. */
  account: StoredAccount | null;
  /** The backend's view of the signed-in user. */
  user: User | null;
  address: Address | null;
  authError: string | null;
  /** One Face ID: creates the passkey, derives the account, opens a session. */
  createAccount: (options?: CreateAccountOptions) => Promise<void>;
  /** One Face ID against the remembered passkey, or the chooser on a fresh phone. */
  signIn: (options?: SignInOptions) => Promise<{ isNew: boolean }>;
  /** Dev builds only: opens the populated Ada preview without a platform passkey. */
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Face ID, then `work` runs with a signing account that is wiped afterwards. */
  authorize: <T>(work: (signer: LocalAccount) => Promise<T>) => Promise<T>;
  refreshUser: () => Promise<User | null>;
  setUser: (user: User) => void;
}
