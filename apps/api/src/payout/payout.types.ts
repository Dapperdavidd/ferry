import type { CashoutPayoutData, StoredPayoutAccount } from "../db/schema";

export interface PayoutNetwork {
  id: string;
  name: string;
  country: string;
  currency: string;
}

export interface ResolvedBankAccount {
  accountName: string;
}

export interface PayoutRate {
  rate: string;
  source: string;
}

export interface PayoutResult {
  reference: string;
  status: string;
}

export interface PayoutProvider {
  readonly enabled: boolean;
  listNetworks(country: string, currency: string): Promise<PayoutNetwork[]>;
  resolveBank(input: {
    accountNumber: string;
    networkId: string;
  }): Promise<ResolvedBankAccount>;
  rate(country: string, currency: string): Promise<PayoutRate>;
  send(input: {
    sequenceId: string;
    localAmount: string;
    account: CashoutPayoutData;
    accountNumber: string;
  }): Promise<PayoutResult>;
  findSend(sequenceId: string): Promise<PayoutResult | null>;
}

export interface PublicPayoutAccount {
  provider: StoredPayoutAccount["provider"];
  country: string;
  currency: string;
  networkId: string;
  bankName: string;
  accountName: string;
  accountEnding: string;
  verifiedAt: string;
}
