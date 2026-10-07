import {
  billPositionAmount,
  formatBillMoney,
  splitEvenly,
} from "@/utils/bills";
import type { Bill } from "@/utils/bills";

function bill(position: Bill["position"], self: number, waiting: number): Bill {
  return {
    id: "bill",
    creatorUserId: "owner",
    groupId: null,
    title: "Dinner",
    note: "",
    totalRaw: "30000000",
    totalCents: 3000,
    currency: "USD",
    category: "food",
    splitMode: "even",
    status: position === "settled" ? "SETTLED" : "OPEN",
    position,
    dueLabel: "Today",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    participants: [
      {
        id: "self",
        handle: "ada",
        name: "Ada",
        initials: "A",
        amountRaw: String(self * 10_000),
        amountCents: self,
        paid: position !== "owe",
        paymentStatus: position === "owe" ? "PENDING" : "PAID",
        self: true,
        invitationStatus: "ACCEPTED",
      },
      {
        id: "friend",
        handle: "bola",
        name: "Bola",
        initials: "B",
        amountRaw: String(waiting * 10_000),
        amountCents: waiting,
        paid: waiting === 0,
        paymentStatus: waiting === 0 ? "PAID" : "PENDING",
        self: false,
        invitationStatus: "ACCEPTED",
      },
    ],
  };
}

describe("bills", () => {
  it("splits every cent without changing the total", () => {
    const shares = splitEvenly(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(1000);
  });

  it("rejects invalid split inputs", () => {
    expect(splitEvenly(-1, 2)).toEqual([]);
    expect(splitEvenly(100, 0)).toEqual([]);
    expect(splitEvenly(1.5, 2)).toEqual([]);
  });

  it("derives the user's bill position", () => {
    expect(billPositionAmount(bill("collecting", 2000, 4300))).toBe(4300);
    expect(billPositionAmount(bill("owe", 1484, 0))).toBe(1484);
    expect(billPositionAmount(bill("settled", 1500, 0))).toBe(0);
  });

  it("formats dollar values for the consumer UI", () => {
    expect(formatBillMoney(1484)).toBe("$14.84");
  });
});
