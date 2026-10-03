import type {
  AgoraNetwork,
  Metrics,
  Route,
  RouteChain,
  Transaction,
  TransactionPage,
  TransactionType,
  WalletAccount,
} from "./agora.types";

export const AGORA_CLIENT = Symbol("AgoraClient");

export interface RegisterWalletParams {
  address: string;
  networks: AgoraNetwork[];
  name?: string;
}

export interface RequestEntitlementParams {
  accountId: string;
  network: AgoraNetwork;
  entitlement: "instant_settlement";
}

export interface CreateRouteParams {
  from: { currency: "ausd" | "stablecoin" | "usd" };
  to: {
    currency: "ausd" | "usd" | "usdc";
    accountId: string;
    chain?: RouteChain;
  };
  name?: string;
}

export interface ListTransactionsParams {
  cursor?: string;
  limit?: number;
  type?: TransactionType[];
  isInstantSettlement?: boolean;
  sourceChain?: AgoraNetwork[];
  recipientChain?: AgoraNetwork[];
  initiatedAt?: { gt?: string; gte?: string; lt?: string; lte?: string };
}

/** Agora's v0 API, live or mocked. `metrics()` is public; the rest need the organisation key. */
export interface AgoraClient {
  metrics(): Promise<Metrics>;
  registerWallet(params: RegisterWalletParams): Promise<WalletAccount>;
  requestEntitlement(params: RequestEntitlementParams): Promise<WalletAccount>;
  createRoute(params: CreateRouteParams): Promise<Route>;
  getTransaction(id: string): Promise<Transaction>;
  listTransactions(params?: ListTransactionsParams): Promise<TransactionPage>;
}
