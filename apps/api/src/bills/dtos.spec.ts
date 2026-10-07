import {
  CreateBillGroupSchema,
  CreateBillSchema,
  ListBillsSchema,
  RespondInvitationSchema,
} from "./dtos";

describe("bill DTOs", () => {
  it("accepts a complete split and normalizes handles", () => {
    const parsed = CreateBillSchema.parse({
      title: "Sunday dinner",
      note: "Luma",
      totalRaw: "86000000",
      creatorAmountRaw: "43000000",
      category: "food",
      splitMode: "even",
      dueLabel: "This week",
      shares: [{ handle: "  BOLA  ", amountRaw: "43000000" }],
    });

    expect(parsed.shares[0].handle).toBe("bola");
  });

  it("rejects malformed money and unbounded participant lists", () => {
    const base = {
      title: "Dinner",
      totalRaw: "1.00",
      creatorAmountRaw: "1000000",
      category: "food",
      splitMode: "even",
      shares: [{ handle: "bola", amountRaw: "1000000" }],
    };

    expect(CreateBillSchema.safeParse(base).success).toBe(false);
    expect(
      CreateBillSchema.safeParse({
        ...base,
        totalRaw: "51000000",
        shares: Array.from({ length: 50 }, (_, index) => ({
          handle: `user${index}`,
          amountRaw: "1000000",
        })),
      }).success,
    ).toBe(false);
  });

  it("keeps list, invitation, and group inputs narrow", () => {
    expect(ListBillsSchema.parse({})).toEqual({ status: "all" });
    expect(RespondInvitationSchema.safeParse({ accepted: "yes" }).success).toBe(
      false,
    );
    expect(
      CreateBillGroupSchema.parse({ name: "Weekend", handles: [" BOLA "] })
        .handles,
    ).toEqual(["bola"]);
  });
});
