import type {
  ApiBill,
  BillParticipant as ApiBillParticipant,
} from "@/utils/apiClient";

export type BillCategory = ApiBill["category"];
export type BillSplitMode = ApiBill["splitMode"];
export type BillPosition = ApiBill["position"];

export type BillParticipant = ApiBillParticipant & {
  amountCents: number;
};

export type Bill = Omit<ApiBill, "participants"> & {
  totalCents: number;
  participants: BillParticipant[];
};

export function rawToCents(raw: string): number {
  return Number(BigInt(raw) / 10_000n);
}

export function centsToRaw(cents: number): string {
  return (BigInt(cents) * 10_000n).toString();
}

export function fromApiBill(bill: ApiBill): Bill {
  return {
    ...bill,
    totalCents: rawToCents(bill.totalRaw),
    participants: bill.participants.map((participant) => ({
      ...participant,
      amountCents: rawToCents(participant.amountRaw),
    })),
  };
}

export function splitEvenly(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0 || count < 1) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base
  );
}

export function formatBillMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function billPositionAmount(bill: Bill): number {
  if (bill.position === "owe") {
    return bill.participants.find((person) => person.self)?.amountCents ?? 0;
  }
  if (bill.position === "collecting") {
    return bill.participants
      .filter((person) => !person.self && !person.paid)
      .reduce((sum, person) => sum + person.amountCents, 0);
  }
  return 0;
}
