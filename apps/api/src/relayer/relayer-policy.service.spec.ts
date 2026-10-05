import type { ConfigService } from "@nestjs/config";
import type { DbService } from "../db/db.service";
import { plusPurchases, sendSponsorships } from "../db/schema";
import {
  freeSponsorshipPeriod,
  RelayerPolicyService,
} from "./relayer-policy.service";

function service(row: { count: number; total: string }) {
  const db = {
    client: {
      select: () => ({
        from: (table: unknown) => {
          if (table === plusPurchases) {
            return {
              where: () => ({
                orderBy: () => ({ limit: () => Promise.resolve([]) }),
              }),
            };
          }
          if (table === sendSponsorships) {
            return { where: () => Promise.resolve([{ count: 0 }]) };
          }
          return { where: () => Promise.resolve([row]) };
        },
      }),
    },
  } as unknown as DbService;
  const config = {
    get: (key: string) => {
      if (key === "RELAYER_MAX_SENDS_PER_USER_PER_DAY") return 2;
      if (key === "RELAYER_MAX_AMOUNT_PER_USER_PER_DAY_RAW") return "10000000";
      if (key === "FERRY_FREE_SPONSORED_SENDS") return 5;
      if (key === "FERRY_PLUS_SPONSORED_SENDS") return 50;
      return undefined;
    },
  } as unknown as ConfigService;
  return new RelayerPolicyService(db, config);
}

describe("RelayerPolicyService", () => {
  it("shares one count and amount cap across every send path", async () => {
    await expect(
      service({ count: 1, total: "4000000" }).assertSendAllowed(
        "user_1",
        5_000_000n,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service({ count: 2, total: "4000000" }).assertSendAllowed("user_1", 1n),
    ).rejects.toMatchObject({ code: "RELAYER_CAP" });
    await expect(
      service({ count: 1, total: "9000000" }).assertSendAllowed(
        "user_1",
        2_000_000n,
      ),
    ).rejects.toMatchObject({ code: "RELAYER_CAP" });
  });

  it("uses stable UTC calendar boundaries for the free allowance", () => {
    expect(freeSponsorshipPeriod(new Date("2026-12-31T23:59:59.000Z"))).toEqual(
      {
        periodStart: new Date("2026-12-01T00:00:00.000Z"),
        resetsAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    );
  });
});
