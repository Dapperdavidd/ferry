import type { ConfigService } from "@nestjs/config";
import type { DbService } from "../db/db.service";
import { RelayerPolicyService } from "./relayer-policy.service";

function service(row: { count: number; total: string }) {
  const db = {
    client: {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([row]),
        }),
      }),
    },
  } as unknown as DbService;
  const config = {
    get: (key: string) =>
      key === "RELAYER_MAX_SENDS_PER_USER_PER_DAY" ? 2 : "10000000",
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
});
