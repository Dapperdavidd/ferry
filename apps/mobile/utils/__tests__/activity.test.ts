import {
  formatActivityTime,
  mapTransferRowToActivityEntry,
  statusLabel,
} from "../activity";
import type { TransferRow } from "../apiClient";

// Local-time instants, so the labels do not depend on the machine's zone.
const at = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("formatActivityTime", () => {
  const now = new Date(2026, 9, 4, 17, 30);

  it("names today and yesterday with the time", () => {
    expect(formatActivityTime(at(2026, 10, 4, 13, 7), now)).toBe(
      "Today, 13:07"
    );
    expect(formatActivityTime(at(2026, 10, 3, 9, 12), now)).toBe(
      "Yesterday, 09:12"
    );
  });

  it("dates older rows this year, and years older ones", () => {
    expect(formatActivityTime(at(2026, 9, 30, 14, 2), now)).toBe(
      "Sep 30, 14:02"
    );
    expect(formatActivityTime(at(2025, 12, 31, 23, 59), now)).toBe(
      "Dec 31, 2025"
    );
  });

  it("is empty for an unreadable timestamp", () => {
    expect(formatActivityTime("not a date", now)).toBe("");
  });
});

describe("Flow activity identity", () => {
  const row: TransferRow = {
    id: "flow-send-1",
    kind: "transfer",
    direction: "SEND",
    token: "AUSD",
    amountRaw: "25000000",
    decimals: 6,
    fromAddress: "0x0000000000000000000000000000000000000001",
    toAddress: "0x0000000000000000000000000000000000000002",
    counterparty: {
      address: "0x0000000000000000000000000000000000000002",
      handle: "bola",
      displayName: "Bola",
    },
    status: "CONFIRMED",
    txHash: `0x${"ab".repeat(32)}`,
    memo: "Ferry Flow",
    usdValue: "25.00",
    createdAt: "2026-10-05T10:00:00.000Z",
    confirmedAt: "2026-10-05T10:00:02.000Z",
    cashout: null,
  };

  it("labels the durable API Flow marker without guessing from the recipient", () => {
    const entry = mapTransferRowToActivityEntry(row, row.fromAddress);
    expect(entry.flow).toBe(true);
    expect(statusLabel(entry)).toBe("Sent with Flow");

    const ordinary = mapTransferRowToActivityEntry(
      { ...row, id: "ordinary-send", memo: null },
      row.fromAddress
    );
    expect(ordinary.flow).toBe(false);
    expect(statusLabel(ordinary)).toBe("Sent");
  });

  it("keeps pending Flow language honest while confirmation is outstanding", () => {
    const entry = mapTransferRowToActivityEntry(
      { ...row, status: "PENDING", confirmedAt: null },
      row.fromAddress
    );
    expect(statusLabel(entry)).toBe("Sending with Flow…");
  });
});
