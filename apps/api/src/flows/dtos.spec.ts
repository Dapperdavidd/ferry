import { PrepareFlowPaymentSchema, PrepareFlowSchema } from "./dtos";

const A = "0x0000000000000000000000000000000000000001";
const B = "0x0000000000000000000000000000000000000002";

describe("Flow DTOs", () => {
  it("accepts one to five ordered destinations totalling 10,000 bps", () => {
    expect(
      PrepareFlowSchema.parse({
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: A,
            basisPoints: 7000,
          },
          { label: "Tax", kind: "pocket", address: B, basisPoints: 3000 },
        ],
      }).destinations,
    ).toHaveLength(2);
  });

  it("rejects incomplete and duplicate allocations", () => {
    const partial = {
      destinations: [
        {
          label: "Spendable",
          kind: "spendable",
          address: A,
          basisPoints: 9000,
        },
      ],
    };
    const duplicate = {
      destinations: [
        {
          label: "Spendable",
          kind: "spendable",
          address: A,
          basisPoints: 5000,
        },
        { label: "Tax", kind: "pocket", address: A, basisPoints: 5000 },
      ],
    };

    expect(PrepareFlowSchema.safeParse(partial).success).toBe(false);
    expect(PrepareFlowSchema.safeParse(duplicate).success).toBe(false);
  });

  it("uses an explicit empty allocation to disable a Flow", () => {
    expect(
      PrepareFlowSchema.parse({ enabled: false, destinations: [] }),
    ).toEqual({ enabled: false, destinations: [] });
    expect(
      PrepareFlowSchema.safeParse({
        enabled: false,
        destinations: [
          {
            label: "Spendable",
            kind: "spendable",
            address: A,
            basisPoints: 10000,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts consumer amounts but refuses excess precision", () => {
    expect(
      PrepareFlowPaymentSchema.parse({ to: "@ada", amount: "100.25" }),
    ).toEqual({ to: "@ada", amount: "100.25" });
    expect(
      PrepareFlowPaymentSchema.safeParse({ to: "@ada", amount: "1.0000001" })
        .success,
    ).toBe(false);
  });
});
