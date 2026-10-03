import { HttpStatus, Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Address } from "viem";
import { ChainService } from "../chain/chain.service";
import { faucetAbi } from "../chain/abi";
import { ApiError } from "../common/errors";
import { AUSD_DECIMALS, ausdToUsd } from "../common/money";
import { DbService } from "../db/db.service";
import { transfers } from "../db/schema";

@Injectable()
export class WalletService {
  constructor(
    private readonly db: DbService,
    private readonly chain: ChainService,
  ) {}

  async balances(address: Address) {
    const raw = await this.chain.ausdBalance(address);
    return {
      address,
      ausd: { raw: raw.toString(), decimals: AUSD_DECIMALS },
      usdValue: ausdToUsd(raw),
      asOf: new Date().toISOString(),
    };
  }

  /** Testnet only: the relayer asks Agora's faucet to pay the user, and the arrival shows as a top-up. */
  async fund(userId: string, address: Address): Promise<{ txHash: string }> {
    if (!this.chain.isTestnet || !this.chain.addresses.faucet) {
      throw new ApiError(
        "NO_FAUCET",
        "Test funds only exist on the test network.",
        HttpStatus.NOT_FOUND,
      );
    }
    const [recent] = await this.db.client
      .select({ txHash: transfers.txHash })
      .from(transfers)
      .where(
        and(
          eq(transfers.userId, userId),
          eq(transfers.kind, "funding"),
          gt(transfers.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
      .orderBy(desc(transfers.createdAt))
      .limit(1);
    if (recent?.txHash) return { txHash: recent.txHash };

    const drip = await this.chain.publicClient.readContract({
      address: this.chain.addresses.faucet,
      abi: faucetAbi,
      functionName: "faucetDripAmount",
    });
    const txHash = await this.chain.faucetDrip(address);
    await this.db.client.insert(transfers).values({
      id: createId(),
      userId,
      kind: "funding",
      direction: "RECEIVE",
      amountRaw: drip.toString(),
      fromAddress: this.chain.addresses.faucet,
      toAddress: address,
      status: "PENDING",
      txHash,
      usdValue: ausdToUsd(drip),
    });
    return { txHash };
  }
}
