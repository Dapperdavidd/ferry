import AsyncStorage from "@react-native-async-storage/async-storage";

export type BillCategory =
  | "food"
  | "transport"
  | "home"
  | "travel"
  | "shopping"
  | "other";

export type BillSplitMode = "even" | "custom";
export type BillPosition = "collecting" | "owe" | "settled" | "draft";

export type BillParticipant = {
  id: string;
  handle: string;
  name: string;
  initials: string;
  amountCents: number;
  paid: boolean;
  self?: boolean;
};

export type Bill = {
  id: string;
  title: string;
  note: string;
  totalCents: number;
  currency: "USD";
  category: BillCategory;
  splitMode: BillSplitMode;
  position: BillPosition;
  dueLabel: string;
  createdAt: string;
  participants: BillParticipant[];
};

export type NewBillInput = Omit<Bill, "id" | "createdAt" | "position">;

const storageKey = (owner: string) =>
  `ferry.bills.${owner.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export const BILL_CONTACTS = [
  { id: "self", handle: "you", name: "You", initials: "A", self: true },
  { id: "bola", handle: "bola", name: "Bola", initials: "B", self: false },
  { id: "mina", handle: "mina", name: "Mina", initials: "M", self: false },
  { id: "sam", handle: "sam", name: "Sam", initials: "S", self: false },
] as const;

export const SEED_BILLS: Bill[] = [
  {
    id: "seed-dinner",
    title: "Sunday dinner",
    note: "Dinner at Luma",
    totalCents: 8600,
    currency: "USD",
    category: "food",
    splitMode: "even",
    position: "collecting",
    dueLabel: "2 people left",
    createdAt: "2026-10-05T18:30:00.000Z",
    participants: [
      { ...BILL_CONTACTS[0], amountCents: 2150, paid: true },
      { ...BILL_CONTACTS[1], amountCents: 2150, paid: false },
      { ...BILL_CONTACTS[2], amountCents: 2150, paid: true },
      { ...BILL_CONTACTS[3], amountCents: 2150, paid: false },
    ],
  },
  {
    id: "seed-ride",
    title: "Airport ride",
    note: "Saturday morning",
    totalCents: 4450,
    currency: "USD",
    category: "transport",
    splitMode: "even",
    position: "owe",
    dueLabel: "Due today",
    createdAt: "2026-10-04T08:15:00.000Z",
    participants: [
      { ...BILL_CONTACTS[0], amountCents: 1484, paid: false },
      { ...BILL_CONTACTS[1], amountCents: 1483, paid: true },
      { ...BILL_CONTACTS[2], amountCents: 1483, paid: true },
    ],
  },
  {
    id: "seed-studio",
    title: "Studio subscription",
    note: "October",
    totalCents: 3000,
    currency: "USD",
    category: "other",
    splitMode: "custom",
    position: "settled",
    dueLabel: "Settled",
    createdAt: "2026-10-01T11:00:00.000Z",
    participants: [
      { ...BILL_CONTACTS[0], amountCents: 1500, paid: true },
      { ...BILL_CONTACTS[3], amountCents: 1500, paid: true },
    ],
  },
];

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

export async function loadBills(owner: string, includeSeed = false) {
  const stored = await AsyncStorage.getItem(storageKey(owner));
  const local = stored ? (JSON.parse(stored) as Bill[]) : [];
  return includeSeed ? [...local, ...SEED_BILLS] : local;
}

export async function saveBill(owner: string, input: NewBillInput) {
  const current = await loadBills(owner);
  const bill: Bill = {
    ...input,
    id: `bill-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    position: "draft",
  };
  await AsyncStorage.setItem(
    storageKey(owner),
    JSON.stringify([bill, ...current])
  );
  return bill;
}
